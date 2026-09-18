/**
 * Tracked links: `/l/{slug}` redirects with click counting.
 *
 * Every workspace-facing function takes `workspaceId` first and scopes by it.
 * The two public entry points used by the redirect route (`resolveLink`,
 * `recordClick`) are deliberately unscoped: a short link is a public URL and
 * the slug is the only thing the visitor has.
 *
 * Dates on returned rows are ISO strings so the same shape crosses both the
 * RSC prop boundary and the JSON API unchanged.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { randomToken, sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { appUrl, optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── Limits ─────────────────────────

export const LINK_SLUG_LENGTH = 7;
export const LINK_MAX_LABEL_LENGTH = 80;
export const LINK_MAX_URL_LENGTH = 2048;
export const LINK_LIST_MAX = 500;
export const LINK_STATS_DEFAULT_DAYS = 30;
export const LINK_STATS_MAX_DAYS = 90;
export const LINK_RECENT_CLICKS = 20;
const SLUG_RETRY_ATTEMPTS = 5;
const MAX_USER_AGENT_LENGTH = 512;
const DAY_MS = 24 * 60 * 60 * 1000;

// ───────────────────────── Validation ─────────────────────────

/** Only web destinations: a `javascript:` or `data:` target would turn the redirect into an open attack surface. */
export const destinationUrlSchema = z
  .string()
  .trim()
  .min(1, "Destination is required")
  .max(LINK_MAX_URL_LENGTH, `URL must be ${LINK_MAX_URL_LENGTH} characters or fewer`)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
      } catch {
        return false;
      }
    },
    { message: "Enter a full URL starting with http:// or https://" },
  );

export const linkLabelSchema = z.string().trim().max(LINK_MAX_LABEL_LENGTH, `Label must be ${LINK_MAX_LABEL_LENGTH} characters or fewer`);

/** Custom slugs: URL-safe, 3–32 chars, can't start with a separator. Case-sensitive like the column. */
export const linkSlugSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, "Slug must be 3–32 letters, numbers, dashes or underscores");

const emptyToUndefined = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalId = z.preprocess(emptyToUndefined, z.string().min(1).max(64).optional());

export const createLinkSchema = z
  .object({
    destinationUrl: destinationUrlSchema,
    label: z.preprocess(emptyToUndefined, linkLabelSchema.optional()),
    automationId: optionalId,
    broadcastId: optionalId,
    slug: z.preprocess(emptyToUndefined, linkSlugSchema.optional()),
  })
  .strict();

export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const updateLinkSchema = z
  .object({
    destinationUrl: destinationUrlSchema.optional(),
    label: z.preprocess(emptyToUndefined, linkLabelSchema.nullable().optional()),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

/** `?automationId=&broadcastId=&q=` */
export const linkListQuerySchema = z.object({
  automationId: optionalId,
  broadcastId: optionalId,
  q: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
});

export type LinkListFilters = z.infer<typeof linkListQuerySchema>;

/** `?days=30` */
export const linkStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(LINK_STATS_MAX_DAYS).default(LINK_STATS_DEFAULT_DAYS),
});

// ───────────────────────── Types ─────────────────────────

export type TrackedLinkSource = { id: string; name: string } | null;

export type TrackedLinkListItem = {
  id: string;
  slug: string;
  /** Absolute short URL (`appUrl("/l/<slug>")`), ready to paste into a message. */
  shortUrl: string;
  label: string | null;
  destinationUrl: string;
  clickCount: number;
  clicks7d: number;
  createdAt: string;
  automation: TrackedLinkSource;
  broadcast: TrackedLinkSource;
};

export type LinkClickPoint = { date: string; clicks: number };

export type LinkRecentClick = {
  id: string;
  createdAt: string;
  userAgent: string | null;
  contact: { id: string; username: string | null; name: string | null } | null;
};

export type TrackedLinkStats = {
  link: TrackedLinkListItem;
  days: number;
  timezone: string;
  /** One point per local day, oldest first, zero-filled. */
  series: LinkClickPoint[];
  clicksInRange: number;
  recentClicks: LinkRecentClick[];
};

// ───────────────────────── Timezone helpers ─────────────────────────
// Exported because lib/services/logs.ts interprets date-range filters the same way.

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) between the zone's wall clock and UTC at `date`; positive east of UTC. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` of `date` as seen in `timeZone` (falls back to UTC for an unknown zone). */
export function zonedDayKey(date: Date, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  // en-CA formats as YYYY-MM-DD, which is exactly the key we group by in SQL.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Local midnight of a `YYYY-MM-DD` key in `timeZone`, as an instant. Handles DST by re-checking the offset once. */
export function zonedDayStart(dayKey: string, timeZone: string): Date {
  const match = DAY_KEY.exec(dayKey);
  if (!match) throw new ApiError(422, "Dates must be YYYY-MM-DD", "BAD_DATE");
  const [, y, m, d] = match;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const first = guess - zoneOffsetMs(new Date(guess), tz);
  const second = guess - zoneOffsetMs(new Date(first), tz);
  return new Date(second);
}

/** Shift a `YYYY-MM-DD` key by whole days (calendar arithmetic, zone-independent). */
export function shiftDayKey(dayKey: string, days: number): string {
  const match = DAY_KEY.exec(dayKey);
  if (!match) throw new ApiError(422, "Dates must be YYYY-MM-DD", "BAD_DATE");
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days)).toISOString().slice(0, 10);
}

// ───────────────────────── Helpers ─────────────────────────

export function buildLinkUrl(slug: string): string {
  return appUrl(`/l/${slug}`);
}

/**
 * 7 chars from the base64url alphabet minus `-`/`_`: i.e. base62. ~3.5e12
 * combinations, so collisions are rare and handled by retrying the insert.
 */
function randomSlug(): string {
  let out = "";
  while (out.length < LINK_SLUG_LENGTH) out += randomToken(16).replace(/[^0-9A-Za-z]/g, "");
  return out.slice(0, LINK_SLUG_LENGTH);
}

/**
 * Visitors' IPs are never stored; a salted hash is enough to tell "one
 * person clicked 5 times" from "5 people clicked". The salt is a prefix of
 * the app key so the hash can't be reversed with a public rainbow table.
 */
function hashIp(ip: string): string {
  const salt = optionalEnv("APP_ENCRYPTION_KEY")?.slice(0, 16) ?? "awwtomation";
  return sha256(`${ip.trim()}|${salt}`);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

const linkSelect = {
  id: true,
  slug: true,
  label: true,
  destinationUrl: true,
  clickCount: true,
  createdAt: true,
  automation: { select: { id: true, name: true } },
  broadcast: { select: { id: true, name: true } },
} satisfies Prisma.TrackedLinkSelect;

type LinkRow = Prisma.TrackedLinkGetPayload<{ select: typeof linkSelect }>;

function toListItem(row: LinkRow, clicks7d: number): TrackedLinkListItem {
  return {
    id: row.id,
    slug: row.slug,
    shortUrl: buildLinkUrl(row.slug),
    label: row.label,
    destinationUrl: row.destinationUrl,
    clickCount: row.clickCount,
    clicks7d,
    createdAt: row.createdAt.toISOString(),
    automation: row.automation,
    broadcast: row.broadcast,
  };
}

/** Clicks in the last 7 days per link, one grouped query for the whole page. */
async function recentClickCounts(linkIds: string[]): Promise<Map<string, number>> {
  if (linkIds.length === 0) return new Map();
  const since = new Date(Date.now() - 7 * DAY_MS);
  const rows = await prisma.linkClick.groupBy({
    by: ["linkId"],
    where: { linkId: { in: linkIds }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.linkId, r._count._all]));
}

async function assertSourceInWorkspace(workspaceId: string, input: { automationId?: string; broadcastId?: string }): Promise<void> {
  if (input.automationId) {
    const automation = await prisma.automation.findFirst({ where: { id: input.automationId, workspaceId }, select: { id: true } });
    if (!automation) throw new ApiError(404, "Automation not found", "NOT_FOUND");
  }
  if (input.broadcastId) {
    const broadcast = await prisma.broadcast.findFirst({ where: { id: input.broadcastId, workspaceId }, select: { id: true } });
    if (!broadcast) throw new ApiError(404, "Broadcast not found", "NOT_FOUND");
  }
}

// ───────────────────────── Commands ─────────────────────────

export async function createTrackedLink(workspaceId: string, input: CreateLinkInput): Promise<TrackedLinkListItem> {
  const data = createLinkSchema.parse(input);
  await assertSourceInWorkspace(workspaceId, data);

  const base = {
    workspaceId,
    destinationUrl: data.destinationUrl,
    label: data.label ?? null,
    automationId: data.automationId ?? null,
    broadcastId: data.broadcastId ?? null,
  };

  if (data.slug) {
    try {
      const row = await prisma.trackedLink.create({ data: { ...base, slug: data.slug }, select: linkSelect });
      logger.info("links.created", { workspaceId, linkId: row.id, slug: row.slug, custom: true });
      return toListItem(row, 0);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError(409, "That slug is already taken", "SLUG_TAKEN");
      throw err;
    }
  }

  // The unique index is the collision check: cheaper than a read-then-write
  // race and correct under concurrency.
  for (let attempt = 1; attempt <= SLUG_RETRY_ATTEMPTS; attempt++) {
    try {
      const row = await prisma.trackedLink.create({ data: { ...base, slug: randomSlug() }, select: linkSelect });
      logger.info("links.created", { workspaceId, linkId: row.id, slug: row.slug });
      return toListItem(row, 0);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === SLUG_RETRY_ATTEMPTS) throw err;
      logger.warn("links.slug_collision", { workspaceId, attempt });
    }
  }
  throw new ApiError(500, "Could not allocate a link slug", "SLUG_ALLOC");
}

/**
 * Returns the workspace's existing link for the same destination *and*
 * source, or creates one. Automations and broadcasts call this when a
 * message button is saved so re-saving never mints a new slug.
 */
export async function ensureTrackedLinkForUrl(
  workspaceId: string,
  url: string,
  options: { automationId?: string; broadcastId?: string; label?: string } = {},
): Promise<TrackedLinkListItem> {
  const destinationUrl = destinationUrlSchema.parse(url);
  const existing = await prisma.trackedLink.findFirst({
    where: {
      workspaceId,
      destinationUrl,
      automationId: options.automationId ?? null,
      broadcastId: options.broadcastId ?? null,
    },
    select: linkSelect,
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    const counts = await recentClickCounts([existing.id]);
    return toListItem(existing, counts.get(existing.id) ?? 0);
  }
  return createTrackedLink(workspaceId, {
    destinationUrl,
    label: options.label,
    automationId: options.automationId,
    broadcastId: options.broadcastId,
  });
}

export async function updateTrackedLink(workspaceId: string, id: string, input: UpdateLinkInput): Promise<TrackedLinkListItem> {
  const data = updateLinkSchema.parse(input);
  const patch: Prisma.TrackedLinkUpdateManyMutationInput = {};
  if (data.destinationUrl !== undefined) patch.destinationUrl = data.destinationUrl;
  if (data.label !== undefined) patch.label = data.label;

  // updateMany is the only update that accepts a non-unique (workspace-scoped) filter.
  const result = await prisma.trackedLink.updateMany({ where: { id, workspaceId }, data: patch });
  if (result.count === 0) throw new ApiError(404, "Link not found", "NOT_FOUND");
  logger.info("links.updated", { workspaceId, linkId: id, fields: Object.keys(patch) });
  return getTrackedLink(workspaceId, id);
}

export async function deleteTrackedLink(workspaceId: string, id: string): Promise<void> {
  const result = await prisma.trackedLink.deleteMany({ where: { id, workspaceId } });
  if (result.count === 0) throw new ApiError(404, "Link not found", "NOT_FOUND");
  logger.info("links.deleted", { workspaceId, linkId: id });
}

// ───────────────────────── Queries ─────────────────────────

export async function listTrackedLinks(workspaceId: string, filters: LinkListFilters = {}): Promise<TrackedLinkListItem[]> {
  const where: Prisma.TrackedLinkWhereInput = { workspaceId };
  if (filters.automationId) where.automationId = filters.automationId;
  if (filters.broadcastId) where.broadcastId = filters.broadcastId;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { label: { contains: q, mode: "insensitive" } },
      { destinationUrl: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.trackedLink.findMany({ where, select: linkSelect, orderBy: { createdAt: "desc" }, take: LINK_LIST_MAX });
  const counts = await recentClickCounts(rows.map((r) => r.id));
  return rows.map((row) => toListItem(row, counts.get(row.id) ?? 0));
}

export async function getTrackedLink(workspaceId: string, id: string): Promise<TrackedLinkListItem> {
  const row = await prisma.trackedLink.findFirst({ where: { id, workspaceId }, select: linkSelect });
  if (!row) throw new ApiError(404, "Link not found", "NOT_FOUND");
  const counts = await recentClickCounts([row.id]);
  return toListItem(row, counts.get(row.id) ?? 0);
}

/**
 * Daily click series for the last `days` local days (in `timezone`) plus the
 * most recent individual clicks. Grouping happens in SQL so a popular link
 * with tens of thousands of clicks doesn't get pulled into Node.
 */
export async function getLinkStats(workspaceId: string, id: string, days = LINK_STATS_DEFAULT_DAYS, timezone = "UTC"): Promise<TrackedLinkStats> {
  const link = await getTrackedLink(workspaceId, id);
  const span = Math.min(Math.max(Math.floor(days), 1), LINK_STATS_MAX_DAYS);
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";

  const todayKey = zonedDayKey(new Date(), tz);
  const firstKey = shiftDayKey(todayKey, -(span - 1));
  const start = zonedDayStart(firstKey, tz);

  const [rows, recent] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; clicks: number }>>(Prisma.sql`
      SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, COUNT(*)::int AS clicks
      FROM "LinkClick"
      WHERE "linkId" = ${link.id} AND "createdAt" >= ${start.toISOString()}::timestamp
      GROUP BY 1
    `),
    prisma.linkClick.findMany({
      where: { linkId: link.id },
      orderBy: { createdAt: "desc" },
      take: LINK_RECENT_CLICKS,
      select: { id: true, createdAt: true, userAgent: true, contact: { select: { id: true, username: true, name: true } } },
    }),
  ]);

  const byDay = new Map(rows.map((r) => [r.day, r.clicks]));
  const series: LinkClickPoint[] = [];
  for (let i = 0; i < span; i++) {
    const date = shiftDayKey(firstKey, i);
    series.push({ date, clicks: byDay.get(date) ?? 0 });
  }

  return {
    link,
    days: span,
    timezone: tz,
    series,
    clicksInRange: series.reduce((sum, p) => sum + p.clicks, 0),
    recentClicks: recent.map((c) => ({ id: c.id, createdAt: c.createdAt.toISOString(), userAgent: c.userAgent, contact: c.contact })),
  };
}

// ───────────────────────── Public redirect path (no workspace scoping) ─────────────────────────

/** Destination for a slug, or null. Public: the slug itself is the capability. */
export async function resolveLink(slug: string): Promise<string | null> {
  if (!slug || slug.length > 64) return null;
  const row = await prisma.trackedLink.findUnique({ where: { slug }, select: { destinationUrl: true } });
  return row?.destinationUrl ?? null;
}

export type RecordClickInput = { contactId?: string; userAgent?: string; ip?: string };

/**
 * Increments the counter and writes the LinkClick row in one statement
 * (nested create inside the update), so concurrent clicks never lose counts.
 * A contact id is only attached when it belongs to the link's workspace:
 * anyone can append `?c=` to a public URL, so it must not be trusted alone.
 * Returns false when the slug doesn't exist.
 */
export async function recordClick(slug: string, input: RecordClickInput = {}): Promise<boolean> {
  const link = await prisma.trackedLink.findUnique({ where: { slug }, select: { id: true, workspaceId: true } });
  if (!link) return false;

  let contactId: string | null = null;
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId: link.workspaceId }, select: { id: true } });
    contactId = contact?.id ?? null;
  }

  const userAgent = input.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) || null;
  const ipHash = input.ip ? hashIp(input.ip) : null;

  try {
    await prisma.trackedLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 }, clicks: { create: { contactId, userAgent, ipHash } } },
      select: { id: true },
    });
  } catch (err) {
    // Deleted between resolve and record: nothing to count.
    if (isNotFound(err)) return false;
    throw err;
  }
  return true;
}
