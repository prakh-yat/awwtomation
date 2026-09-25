/**
 * Delivery logs: the audit trail of every DM, private reply, public reply
 * and broadcast message the platform tried to send, with the reason when it
 * didn't go out. Rows are written by lib/automation/send.ts and friends; this
 * module only reads them.
 *
 * Every function takes `workspaceId` first and scopes by it. Date-range
 * filters are `YYYY-MM-DD` keys interpreted in the workspace timezone, so
 * "today" means the user's today.
 */
import { DeliveryKind, DeliveryStatus, Prisma, type ChannelPlatform } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { shiftDayKey, zonedDayKey, zonedDayStart } from "@/lib/services/links";
import { ApiError } from "@/lib/workspace/api";
import { customerReason, deliveryReason } from "@/lib/errors/customer-messages";

// ───────────────────────── Limits ─────────────────────────

export const LOG_LIST_DEFAULT_LIMIT = 50;
export const LOG_LIST_MAX_LIMIT = 200;
/** Export ceiling: beyond this a CSV in one response is the wrong tool. */
export const LOG_EXPORT_MAX_ROWS = 50_000;
const EXPORT_PAGE_SIZE = 1000;

export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  DeliveryStatus.SENT,
  DeliveryStatus.FAILED,
  DeliveryStatus.SKIPPED_DUPLICATE,
  DeliveryStatus.SKIPPED_RATE_LIMIT,
  DeliveryStatus.SKIPPED_SELF,
  DeliveryStatus.SKIPPED_NOT_FOLLOWING,
  DeliveryStatus.SKIPPED_WINDOW,
  DeliveryStatus.SKIPPED_PLAN_LIMIT,
  DeliveryStatus.SKIPPED_CONTACT_LIMIT,
  DeliveryStatus.SKIPPED_OPTED_OUT,
] as const;

export const DELIVERY_KINDS: readonly DeliveryKind[] = [
  DeliveryKind.PRIVATE_REPLY,
  DeliveryKind.MESSAGE,
  DeliveryKind.PUBLIC_REPLY,
  DeliveryKind.BROADCAST,
] as const;

// ───────────────────────── Validation ─────────────────────────

const emptyToUndefined = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalId = z.preprocess(emptyToUndefined, z.string().min(1).max(64).optional());
const optionalDay = z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD").optional());

/** `?status=&kind=&channelId=&automationId=&broadcastId=&contactId=&q=&from=&to=&cursor=&limit=` */
export const deliveryLogQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.nativeEnum(DeliveryStatus).optional()),
  kind: z.preprocess(emptyToUndefined, z.nativeEnum(DeliveryKind).optional()),
  channelId: optionalId,
  automationId: optionalId,
  broadcastId: optionalId,
  contactId: optionalId,
  /** Recipient username (with or without a leading @). */
  q: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  from: optionalDay,
  to: optionalDay,
  cursor: z.preprocess(emptyToUndefined, z.string().min(1).max(512).optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(LOG_LIST_MAX_LIMIT).optional()),
});

export type DeliveryLogQuery = z.infer<typeof deliveryLogQuerySchema>;

export type DeliveryLogFilters = Omit<DeliveryLogQuery, "cursor" | "limit">;

export type ListDeliveryLogsOptions = DeliveryLogQuery & {
  /** IANA zone used to interpret `from`/`to`. Defaults to UTC. */
  timezone?: string;
};

// ───────────────────────── Types ─────────────────────────

export type DeliveryLogItem = {
  id: string;
  kind: DeliveryKind;
  status: DeliveryStatus;
  createdAt: string;
  recipientUsername: string | null;
  messagePreview: string | null;
  /** Plain-language reason for a skip or failure; null when sent. */
  reason: string | null;
  /** One or two sentences on what happened and what to do; null when sent. */
  reasonDetail: string | null;
  channel: { id: string; platform: ChannelPlatform; username: string | null; name: string | null };
  automation: { id: string; name: string } | null;
  broadcast: { id: string; name: string } | null;
  contact: { id: string; username: string | null; name: string | null } | null;
};

export type DeliveryLogListResult = { items: DeliveryLogItem[]; nextCursor: string | null };

export type LogStats = {
  total: number;
  byStatus: Record<DeliveryStatus, number>;
};

export type LogStatsOptions = DeliveryLogFilters & {
  /** Optional window when `from`/`to` are absent: the last `days` local days. Omit for all time. */
  days?: number;
  timezone?: string;
};

export type LogFilterOptions = {
  channels: Array<{ id: string; platform: ChannelPlatform; username: string | null; name: string | null }>;
  automations: Array<{ id: string; name: string }>;
};

// ───────────────────────── Cursor (keyset on createdAt desc, id desc) ─────────────────────────

const cursorPayloadSchema = z.object({ t: z.string().min(1), id: z.string().min(1) });

function encodeCursor(item: Pick<DeliveryLogItem, "id" | "createdAt">): string {
  return Buffer.from(JSON.stringify({ t: item.createdAt, id: item.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { t: Date; id: string } {
  try {
    const parsed = cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    const t = new Date(parsed.t);
    if (Number.isNaN(t.getTime())) throw new Error("bad time");
    return { t, id: parsed.id };
  } catch {
    throw new ApiError(422, "Invalid cursor", "BAD_CURSOR");
  }
}

// ───────────────────────── Filters ─────────────────────────

function dateRange(filters: { from?: string; to?: string }, timezone: string): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (filters.from) range.gte = zonedDayStart(filters.from, timezone);
  // `to` is inclusive for the user, so the bound is the start of the next day.
  if (filters.to) range.lt = zonedDayStart(shiftDayKey(filters.to, 1), timezone);
  return range.gte || range.lt ? range : undefined;
}

function buildWhere(workspaceId: string, filters: DeliveryLogFilters, timezone: string, opts: { includeStatus: boolean }): Prisma.DeliveryLogWhereInput {
  const where: Prisma.DeliveryLogWhereInput = { workspaceId };
  if (opts.includeStatus && filters.status) where.status = filters.status;
  if (filters.kind) where.kind = filters.kind;
  if (filters.channelId) where.channelId = filters.channelId;
  if (filters.automationId) where.automationId = filters.automationId;
  if (filters.broadcastId) where.broadcastId = filters.broadcastId;
  if (filters.contactId) where.contactId = filters.contactId;

  const q = filters.q?.trim().replace(/^@/, "");
  if (q) {
    // The username is snapshotted on the log, but older rows (or contacts
    // renamed since) only match through the contact relation.
    where.OR = [
      { recipientUsername: { contains: q, mode: "insensitive" } },
      { contact: { is: { username: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const createdAt = dateRange(filters, timezone);
  if (createdAt) where.createdAt = createdAt;
  return where;
}

const logSelect = {
  id: true,
  kind: true,
  status: true,
  createdAt: true,
  recipientUsername: true,
  messagePreview: true,
  errorMessage: true,
  channel: { select: { id: true, platform: true, username: true, name: true } },
  automation: { select: { id: true, name: true } },
  broadcast: { select: { id: true, name: true } },
  contact: { select: { id: true, username: true, name: true } },
} satisfies Prisma.DeliveryLogSelect;

type LogRow = Prisma.DeliveryLogGetPayload<{ select: typeof logSelect }>;

function toItem(row: LogRow): DeliveryLogItem {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    recipientUsername: row.recipientUsername ?? row.contact?.username ?? null,
    messagePreview: row.messagePreview,
    reason: customerReason(row.status, row.errorMessage),
    reasonDetail: row.status === "SENT" ? null : deliveryReason(row.status, row.errorMessage).description,
    channel: row.channel,
    automation: row.automation,
    broadcast: row.broadcast,
    contact: row.contact,
  };
}

// ───────────────────────── Queries ─────────────────────────

export async function listDeliveryLogs(workspaceId: string, options: ListDeliveryLogsOptions = {}): Promise<DeliveryLogListResult> {
  const limit = Math.min(Math.max(options.limit ?? LOG_LIST_DEFAULT_LIMIT, 1), LOG_LIST_MAX_LIMIT);
  return fetchLogPage(workspaceId, options, limit);
}

/** Unclamped page fetch shared by the API list (≤ 200) and the CSV export (1000 per round trip). */
async function fetchLogPage(workspaceId: string, options: ListDeliveryLogsOptions, limit: number): Promise<DeliveryLogListResult> {
  const timezone = options.timezone ?? "UTC";
  const base = buildWhere(workspaceId, options, timezone, { includeStatus: true });
  let where = base;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    where = { AND: [base, { OR: [{ createdAt: { lt: cursor.t } }, { createdAt: cursor.t, id: { lt: cursor.id } }] }] };
  }

  const rows = await prisma.deliveryLog.findMany({
    where,
    select: logSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toItem);
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/**
 * Counts by status for the filtered range. The status filter itself is
 * ignored so the summary chips can act as a status picker: every chip shows
 * its count regardless of which one is selected.
 */
export async function getLogStats(workspaceId: string, options: LogStatsOptions | number = {}): Promise<LogStats> {
  const opts: LogStatsOptions = typeof options === "number" ? { days: options } : options;
  const timezone = opts.timezone ?? "UTC";

  // Without an explicit window the counts cover the same rows as the list
  // (all time), so the summary chips always add up to what's being browsed.
  const filters: DeliveryLogFilters = { ...opts };
  if (opts.days !== undefined && !filters.from && !filters.to) {
    const days = Math.max(Math.floor(opts.days), 1);
    filters.from = shiftDayKey(zonedDayKey(new Date(), timezone), -(days - 1));
  }

  const where = buildWhere(workspaceId, filters, timezone, { includeStatus: false });
  const rows = await prisma.deliveryLog.groupBy({ by: ["status"], where, _count: { _all: true } });

  const byStatus = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0])) as Record<DeliveryStatus, number>;
  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }
  return { total, byStatus };
}

/** Channels and automations of the workspace, for the filter selects. */
export async function listLogFilterOptions(workspaceId: string): Promise<LogFilterOptions> {
  const [channels, automations] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, username: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.automation.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { channels, automations };
}

// ───────────────────────── CSV export ─────────────────────────

const CSV_HEADER = [
  "time_utc",
  "type",
  "outcome",
  "reason",
  "recipient",
  "channel",
  "platform",
  "automation",
  "broadcast",
  "message",
] as const;

/** RFC 4180 quoting plus a guard against spreadsheet formula injection (`=cmd()`). */
function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(item: DeliveryLogItem): string {
  const channelLabel = item.channel.username ? `@${item.channel.username}` : (item.channel.name ?? item.channel.id);
  return [
    item.createdAt,
    item.kind,
    item.status,
    item.reason,
    item.recipientUsername,
    channelLabel,
    item.channel.platform,
    item.automation?.name ?? null,
    item.broadcast?.name ?? null,
    item.messagePreview,
  ]
    .map(csvCell)
    .join(",");
}

/** Same filters as the list; streams through pages so memory stays bounded. Capped at LOG_EXPORT_MAX_ROWS. */
export async function exportLogsCsv(workspaceId: string, filters: DeliveryLogFilters & { timezone?: string } = {}): Promise<string> {
  const lines: string[] = [CSV_HEADER.join(",")];
  let cursor: string | null = null;
  let total = 0;

  do {
    const page: DeliveryLogListResult = await fetchLogPage(
      workspaceId,
      { ...filters, cursor: cursor ?? undefined },
      Math.min(EXPORT_PAGE_SIZE, LOG_EXPORT_MAX_ROWS - total),
    );
    for (const item of page.items) lines.push(csvRow(item));
    total += page.items.length;
    cursor = page.nextCursor;
  } while (cursor && total < LOG_EXPORT_MAX_ROWS);

  return `${lines.join("\r\n")}\r\n`;
}
