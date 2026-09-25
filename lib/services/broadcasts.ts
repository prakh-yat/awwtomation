/**
 * Broadcasts: one message to a tagged audience on a single channel.
 *
 * Meta rule at the heart of this module: a business may only message people
 * who wrote to it in the last 24 hours (`Conversation.lastInboundAt`). A
 * broadcast therefore targets everyone matching the audience filters, sends
 * to those inside the window right now, and records a SKIPPED_WINDOW delivery
 * log for the rest so the report explains every contact. The HUMAN_AGENT tag
 * (7 days) is reserved for human replies and is never used here: marketing
 * blasts under that tag are a policy violation.
 *
 * Sending never loads the whole audience at once. `sendBroadcast` claims the
 * broadcast and queues a BROADCAST_FANOUT job; that job reads the audience a
 * page at a time, queues a BROADCAST_SEND per contact inside the window, logs
 * the rest, and queues the next page. Progress is the counters on the row
 * (target, sent, failed, skipped), so nothing has to count jobs to report it.
 *
 * Every function takes `workspaceId` first and scopes each query by it.
 */
import {
  BroadcastStatus,
  ChannelStatus,
  DeliveryKind,
  DeliveryStatus,
  JobStatus,
  JobType,
  Prisma,
  type Broadcast,
  type Channel,
  type Job,
} from "@prisma/client";
import { z } from "zod";

import { outboundMessageSchema } from "@/lib/automation/flow-types";
import { MESSAGING_WINDOW_MS, RATE_LIMIT_MAX_DEFER_MS, recordDeliveryLog, sendToContact } from "@/lib/automation/send";
import { canUseBroadcasts, checkBroadcastQuota } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { MAX_BUTTON_TEMPLATE_CHARS, MAX_BUTTON_TITLE_CHARS, MAX_BUTTONS, MAX_TEXT_BYTES, messagePreview, utf8Bytes } from "@/lib/meta/messages";
import type { OutboundMessage } from "@/lib/meta/types";
import { enqueue } from "@/lib/queue";
import {
  buildContactWhere,
  compactSegmentFilters,
  getSegment,
  SEGMENT_MAX_LAST_INTERACTION_DAYS,
  SEGMENT_MAX_QUERY_LENGTH,
  type SegmentFilters,
  tagMatchModeSchema,
} from "@/lib/services/segments";
import { recordAudit } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";
import { customerReason } from "@/lib/errors/customer-messages";

// ───────────────────────── Constants ─────────────────────────

/** Rows shown on the report page; the full log lives in /logs. */
export const BROADCAST_DELIVERY_PAGE = 100;
/** Jobs are staggered so a large audience never slams the per-minute send limit. */
export const SEND_JOBS_PER_MINUTE = 500;
/** Contacts one BROADCAST_FANOUT job reads and queues. */
export const FANOUT_PAGE_SIZE = 1000;
/** A SENDING broadcast whose counters haven't moved for this long is checked by finalizeStuckBroadcasts. */
export const STUCK_SENDING_GRACE_MS = 5 * 60_000;
/** Backoff doubles from a minute, so eight attempts ride out about two hours of database trouble. */
const FANOUT_MAX_ATTEMPTS = 8;
const SEND_MAX_ATTEMPTS = 5;
/** How far in the past a "future" schedule may be (clock skew between browser and server). */
const SCHEDULE_TOLERANCE_MS = 60_000;

// ───────────────────────── Validation ─────────────────────────

const tagSchema = z.string().trim().min(1).max(64);

/**
 * Same vocabulary as `segmentFiltersSchema` (channel/platform are implied by
 * the broadcast's channel; opted-out contacts are always excluded). Rows
 * written before segments existed lack the newer keys and read as before:
 * tags matched "any", no time or text filter.
 */
export const broadcastAudienceSchema = z.object({
  /** Contact must carry all/any (`tagMode`) of these (empty = everyone on the channel). */
  tags: z.array(tagSchema).max(50).default([]),
  tagMode: tagMatchModeSchema.default("any"),
  /** Contact must carry none of these. */
  excludeTags: z.array(tagSchema).max(50).default([]),
  onlyFollowers: z.boolean().default(false),
  /** Interacted within the last N days; null/absent = any time. */
  lastInteractionDays: z.number().int().min(1).max(SEGMENT_MAX_LAST_INTERACTION_DAYS).nullable().default(null),
  /** Case-insensitive name/@username search, as on the contacts page. */
  q: z.string().trim().max(SEGMENT_MAX_QUERY_LENGTH).default(""),
  /** Saved segment these filters were copied from: display only; the filters above are what gets sent. */
  segmentId: z.string().min(1).max(64).nullable().default(null),
  /** Always true: kept explicit so the stored audience documents the Meta constraint. */
  onlyInWindow: z.literal(true).default(true),
});

export type BroadcastAudience = z.infer<typeof broadcastAudienceSchema>;

export const EMPTY_AUDIENCE: BroadcastAudience = {
  tags: [],
  tagMode: "any",
  excludeTags: [],
  onlyFollowers: false,
  lastInteractionDays: null,
  q: "",
  segmentId: null,
  onlyInWindow: true,
};

/** The audience as segment filters: exactly what the contacts page would evaluate, minus channel scoping. */
export function audienceToSegmentFilters(audience: BroadcastAudience): SegmentFilters {
  return compactSegmentFilters({
    tags: audience.tags,
    tagMode: audience.tagMode,
    excludeTags: audience.excludeTags,
    onlyFollowers: audience.onlyFollowers,
    lastInteractionDays: audience.lastInteractionDays ?? undefined,
    q: audience.q || undefined,
    excludeOptedOut: true,
  });
}

/** Saved segment → audience. Channel/platform stay with the broadcast; `excludeFollowers` has no broadcast equivalent and is dropped. */
export function segmentFiltersToAudience(filters: SegmentFilters, segmentId: string | null): BroadcastAudience {
  return {
    tags: filters.tags ?? [],
    tagMode: filters.tagMode ?? "all",
    excludeTags: filters.excludeTags ?? [],
    onlyFollowers: Boolean(filters.onlyFollowers),
    lastInteractionDays: filters.lastInteractionDays ?? null,
    q: filters.q ?? "",
    segmentId,
    onlyInWindow: true,
  };
}

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");

/** Broadcast buttons are links only: postback buttons need a flow session to answer them. */
const broadcastButtonSchema = z.object({
  type: z.literal("web_url"),
  title: z.string().trim().min(1, "Button needs a label").max(MAX_BUTTON_TITLE_CHARS, `Button labels are at most ${MAX_BUTTON_TITLE_CHARS} characters`),
  url: httpUrl,
});

export const broadcastMessageSchema = z
  .object({
    text: z.string().max(4000).optional(),
    buttons: z.array(broadcastButtonSchema).max(MAX_BUTTONS, `At most ${MAX_BUTTONS} buttons`).optional(),
    imageUrl: httpUrl.optional(),
  })
  .superRefine((m, ctx) => {
    const text = m.text?.trim() ?? "";
    if (!text && !m.imageUrl) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Add some text or an image" });
    if (utf8Bytes(text) > MAX_TEXT_BYTES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: `Text must be ${MAX_TEXT_BYTES} bytes or fewer` });
    }
    if ((m.buttons?.length ?? 0) > 0 && Array.from(text).length > MAX_BUTTON_TEMPLATE_CHARS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: `Text must be ${MAX_BUTTON_TEMPLATE_CHARS} characters or fewer when the message has buttons` });
    }
  })
  .transform((m) => {
    const text = m.text?.trim();
    const out: OutboundMessage = {};
    if (text) out.text = text;
    if (m.buttons?.length) out.buttons = m.buttons;
    if (m.imageUrl) out.imageUrl = m.imageUrl;
    return out;
  });

/** ISO 8601 string → Date. `z.coerce.date()` would turn `null` into the epoch, so parse explicitly. */
const isoDateSchema = z
  .string()
  .datetime({ offset: true, message: "Use an ISO 8601 timestamp" })
  .transform((s) => new Date(s));

export const createBroadcastSchema = z.object({
  name: z.string().trim().min(1, "Give the broadcast a name").max(80),
  channelId: z.string().min(1, "Choose a channel"),
  message: broadcastMessageSchema,
  audience: broadcastAudienceSchema.default({}),
  /** Set → SCHEDULED; null/absent → DRAFT. */
  scheduledAt: isoDateSchema.nullable().optional(),
});

export const updateBroadcastSchema = createBroadcastSchema.partial();

export const estimateAudienceSchema = z.object({
  channelId: z.string().min(1, "Choose a channel"),
  audience: broadcastAudienceSchema.default({}),
  /** When set, the segment's saved filters are estimated instead of `audience`. */
  segmentId: z.string().min(1).max(64).optional(),
});

/** BROADCAST_SEND job payload (dedupeKey `bc:${broadcastId}:${contactId}`). */
export const broadcastJobPayloadSchema = z.object({
  broadcastId: z.string().min(1),
  contactId: z.string().min(1),
  /** Incremented on every rate-limit deferral; the key suffix keeps re-enqueues unique. */
  rateLimitRetries: z.number().int().min(0).optional(),
});

/** BROADCAST_FANOUT job payload (dedupeKey `broadcast:${broadcastId}:fanout:${cursor ?? "start"}`). */
export const broadcastFanoutPayloadSchema = z
  .object({
    broadcastId: z.string().min(1),
    /** Id of the last contact on the previous page; null for the first page. */
    cursor: z.string().min(1).nullable(),
    /** That contact's createdAt: pages are read in (createdAt, id) order. */
    cursorCreatedAt: z.string().datetime().nullable(),
    /** Sends queued by the pages before this one, so the stagger carries on where they left off. */
    index: z.number().int().min(0),
  })
  .refine((p) => (p.cursor === null) === (p.cursorCreatedAt === null), "cursor and cursorCreatedAt go together");

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
export type UpdateBroadcastInput = z.infer<typeof updateBroadcastSchema>;
export type BroadcastJobPayload = z.infer<typeof broadcastJobPayloadSchema>;
export type BroadcastFanoutPayload = z.infer<typeof broadcastFanoutPayloadSchema>;

// ───────────────────────── Types ─────────────────────────

export type BroadcastChannelSummary = Pick<Channel, "id" | "platform" | "username" | "name" | "avatarUrl" | "status">;

export type BroadcastWithChannel = Broadcast & {
  channel: BroadcastChannelSummary;
  /** Current name of `audience.segmentId`'s segment; null when none was used or it has since been deleted. */
  segmentName?: string | null;
};

export type AudienceEstimate = {
  /** Contacts matching the filters (opted-out and the account itself excluded). */
  total: number;
  /** Subset whose conversation had an inbound message in the last 24h. */
  eligible: number;
  /** total − eligible: would be logged as SKIPPED_WINDOW if sent right now. */
  skippedWindow: number;
};

export type BroadcastStats = {
  target: number;
  sent: number;
  failed: number;
  skipped: number;
  /** sent + failed + skipped */
  processed: number;
  /** 0..1 share of the target that has been processed. */
  progress: number;
  byStatus: Partial<Record<DeliveryStatus, number>>;
  /**
   * False while a sending broadcast is still going through its audience:
   * `target` then counts only the people reached so far, and keeps growing.
   */
  audienceComplete: boolean;
  /** Targeted people still waiting for an outcome while it sends; 0 otherwise. */
  remaining: number;
};

export type BroadcastDeliveryEntry = {
  id: string;
  status: DeliveryStatus;
  createdAt: Date;
  /** Plain-language reason for a skip or failure; null when sent. */
  reason: string | null;
  recipientUsername: string | null;
  contact: { id: string; username: string | null; name: string | null; avatarUrl: string | null } | null;
};

export type BroadcastDetail = BroadcastWithChannel & {
  audienceParsed: BroadcastAudience;
  messageParsed: OutboundMessage;
  stats: BroadcastStats;
  deliveries: BroadcastDeliveryEntry[];
  deliveryTotal: number;
};

/** JSON-safe projection handed to client components (dates as ISO strings). */
export type BroadcastRow = {
  id: string;
  name: string;
  status: BroadcastStatus;
  channelId: string;
  channel: { id: string; platform: BroadcastChannelSummary["platform"]; username: string | null; name: string | null; status: ChannelStatus };
  audience: BroadcastAudience;
  /** Resolved at read time so a renamed segment shows its new name; null once deleted. */
  segmentName: string | null;
  message: OutboundMessage;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * The broadcast, now SENDING. Who it reaches is worked out page by page after
 * this returns, so there are no counts yet: the report fills them in.
 */
export type SendBroadcastResult = { broadcast: Broadcast };

export type ProcessDueResult = {
  started: string[];
  failed: Array<{ id: string; error: string }>;
  finalized: string[];
};

// ───────────────────────── JSON helpers ─────────────────────────

const channelSelect = { id: true, platform: true, username: true, name: true, avatarUrl: true, status: true } as const;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Tolerant read of the stored audience: older rows may lack keys. */
export function parseBroadcastAudience(json: Prisma.JsonValue | null | undefined): BroadcastAudience {
  const parsed = broadcastAudienceSchema.safeParse(json ?? {});
  return parsed.success ? parsed.data : EMPTY_AUDIENCE;
}

/** Null when the stored message is unusable (never expected, but never trust JSON). */
export function parseBroadcastMessage(json: Prisma.JsonValue | null | undefined): OutboundMessage | null {
  const parsed = outboundMessageSchema.safeParse(json);
  if (!parsed.success) return null;
  const m = parsed.data;
  if (!m.text?.trim() && !m.imageUrl) return null;
  return m;
}

export function toBroadcastRow(b: BroadcastWithChannel): BroadcastRow {
  return {
    id: b.id,
    name: b.name,
    status: b.status,
    channelId: b.channelId,
    channel: { id: b.channel.id, platform: b.channel.platform, username: b.channel.username, name: b.channel.name, status: b.channel.status },
    audience: parseBroadcastAudience(b.audience),
    segmentName: b.segmentName ?? null,
    message: parseBroadcastMessage(b.message) ?? {},
    targetCount: b.targetCount,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    skippedCount: b.skippedCount,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    startedAt: b.startedAt?.toISOString() ?? null,
    completedAt: b.completedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

// ───────────────────────── Guards ─────────────────────────

function notFound(): ApiError {
  return new ApiError(404, "Broadcast not found", "NOT_FOUND");
}

function statusLabel(status: BroadcastStatus): string {
  return status.toLowerCase();
}

async function assertPlanAllowsBroadcasts(workspaceId: string): Promise<void> {
  if (!(await canUseBroadcasts(workspaceId))) {
    throw new ApiError(402, "Broadcasts are available on the Starter plan and above", "PLAN_LIMIT");
  }
}

/** One more broadcast this month (sent now, or scheduled for a day this month) must fit the plan. */
async function assertBroadcastQuota(workspaceId: string, opts: { scheduledFor?: Date; excludeId?: string } = {}): Promise<void> {
  const quota = await checkBroadcastQuota(workspaceId, opts);
  if (!quota.ok) {
    throw new ApiError(
      402,
      `Your plan allows ${quota.limit} broadcast${quota.limit === 1 ? "" : "s"} a month and this month's are used. Upgrade, or send it next month.`,
      "PLAN_LIMIT",
    );
  }
}

async function assertChannel(workspaceId: string, channelId: string): Promise<Pick<Channel, "id" | "status">> {
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true, status: true } });
  if (!channel) throw new ApiError(404, "That account isn't connected to this workspace", "CHANNEL_NOT_FOUND");
  if (channel.status === ChannelStatus.DISCONNECTED) throw new ApiError(409, "That channel is disconnected", "CHANNEL_INACTIVE");
  return channel;
}

function assertFuture(date: Date): void {
  if (Number.isNaN(date.getTime())) throw new ApiError(422, "Invalid schedule time", "VALIDATION");
  if (date.getTime() < Date.now() - SCHEDULE_TOLERANCE_MS) throw new ApiError(422, "Pick a time in the future", "VALIDATION");
}

// ───────────────────────── Audience ─────────────────────────

/**
 * The audience predicate is the contacts page's `buildContactWhere` (so the
 * estimate equals the list filtered the same way, on this channel, with
 * opted-out hidden) plus one Meta rule: never the account itself.
 */
function audienceWhere(workspaceId: string, channel: Pick<Channel, "id" | "externalId">, audience: BroadcastAudience, now = new Date()): Prisma.ContactWhereInput {
  return {
    AND: [
      buildContactWhere(workspaceId, { ...audienceToSegmentFilters(audience), channelId: channel.id }, now),
      // Meta rejects messages to the account itself; don't even count it.
      { externalId: { not: channel.externalId } },
    ],
  };
}

function windowCutoff(now = Date.now()): Date {
  return new Date(now - MESSAGING_WINDOW_MS);
}

/** Resolve `segmentId` (if given) to an audience the estimate/send path understands. */
export async function audienceForEstimate(workspaceId: string, input: { audience: BroadcastAudience; segmentId?: string }): Promise<BroadcastAudience> {
  if (!input.segmentId) return input.audience;
  const segment = await getSegment(workspaceId, input.segmentId);
  if (!segment) throw new ApiError(404, "Segment not found", "SEGMENT_NOT_FOUND");
  return segmentFiltersToAudience(segment.filters, segment.id);
}

/** Count-only version used by the editor's live estimate. */
export async function estimateAudience(workspaceId: string, channelId: string, audience: BroadcastAudience): Promise<AudienceEstimate> {
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true, externalId: true } });
  if (!channel) throw new ApiError(404, "That account isn't connected to this workspace", "CHANNEL_NOT_FOUND");
  const now = new Date();
  const where = audienceWhere(workspaceId, channel, audience, now);
  const cutoff = windowCutoff(now.getTime());
  // A contact has at most one conversation per channel (unique index), so `some` is exact.
  const [total, eligible] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { AND: [where, { conversations: { some: { channelId: channel.id, lastInboundAt: { gte: cutoff } } } }] } }),
  ]);
  return { total, eligible, skippedWindow: total - eligible };
}

// ───────────────────────── Job keys ─────────────────────────

/** Every BROADCAST_SEND job of a broadcast has a dedupe key starting with this: first sends and rate-limit re-queues alike. */
function sendJobKeyPrefix(broadcastId: string): string {
  return `bc:${broadcastId}:`;
}

function sendJobKey(broadcastId: string, contactId: string): string {
  return `${sendJobKeyPrefix(broadcastId)}${contactId}`;
}

function fanoutJobKeyPrefix(broadcastId: string): string {
  return `broadcast:${broadcastId}:fanout:`;
}

function fanoutJobKey(broadcastId: string, cursor: string | null): string {
  return `${fanoutJobKeyPrefix(broadcastId)}${cursor ?? "start"}`;
}

// ───────────────────────── Reads ─────────────────────────

/** Segment names for a batch of broadcasts in one query (ids come from stored JSON, so scope by workspace again). */
async function segmentNamesFor(workspaceId: string, broadcasts: Broadcast[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(broadcasts.map((b) => parseBroadcastAudience(b.audience).segmentId).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const rows = await prisma.segment.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function listBroadcasts(workspaceId: string): Promise<BroadcastWithChannel[]> {
  const rows = await prisma.broadcast.findMany({
    where: { workspaceId },
    include: { channel: { select: channelSelect } },
    orderBy: { createdAt: "desc" },
  });
  const names = await segmentNamesFor(workspaceId, rows);
  return rows.map((b) => ({ ...b, segmentName: names.get(parseBroadcastAudience(b.audience).segmentId ?? "") ?? null }));
}

/** Channels a broadcast can be sent from. Lives here because the channels lane's service is a separate deliverable. */
export function listBroadcastChannels(workspaceId: string): Promise<BroadcastChannelSummary[]> {
  return prisma.channel.findMany({
    where: { workspaceId, status: { not: ChannelStatus.DISCONNECTED } },
    select: channelSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function getBroadcast(workspaceId: string, id: string): Promise<BroadcastDetail | null> {
  const broadcast = await prisma.broadcast.findFirst({ where: { id, workspaceId }, include: { channel: { select: channelSelect } } });
  if (!broadcast) return null;

  const logWhere: Prisma.DeliveryLogWhereInput = { broadcastId: id, workspaceId };
  const [grouped, deliveries, deliveryTotal] = await Promise.all([
    prisma.deliveryLog.groupBy({ by: ["status"], where: logWhere, _count: { _all: true } }),
    prisma.deliveryLog.findMany({
      where: logWhere,
      orderBy: { createdAt: "desc" },
      take: BROADCAST_DELIVERY_PAGE,
      select: {
        id: true,
        status: true,
        createdAt: true,
        errorMessage: true,
        recipientUsername: true,
        contact: { select: { id: true, username: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.deliveryLog.count({ where: logWhere }),
  ]);

  const byStatus: Partial<Record<DeliveryStatus, number>> = {};
  for (const row of grouped) byStatus[row.status] = row._count._all;

  const audienceParsed = parseBroadcastAudience(broadcast.audience);
  const segmentName = audienceParsed.segmentId ? (await segmentNamesFor(workspaceId, [broadcast])).get(audienceParsed.segmentId) ?? null : null;

  const processed = broadcast.sentCount + broadcast.failedCount + broadcast.skippedCount;
  return {
    ...broadcast,
    segmentName,
    audienceParsed,
    messageParsed: parseBroadcastMessage(broadcast.message) ?? {},
    stats: {
      target: broadcast.targetCount,
      sent: broadcast.sentCount,
      failed: broadcast.failedCount,
      skipped: broadcast.skippedCount,
      processed,
      progress: broadcast.targetCount > 0 ? Math.min(1, processed / broadcast.targetCount) : broadcast.status === BroadcastStatus.SENT ? 1 : 0,
      byStatus,
      audienceComplete: broadcast.fanoutCompletedAt !== null,
      remaining: broadcast.status === BroadcastStatus.SENDING ? Math.max(0, broadcast.targetCount - processed) : 0,
    },
    deliveries: deliveries.map(({ errorMessage, ...d }) => ({ ...d, reason: customerReason(d.status, errorMessage) })),
    deliveryTotal,
  };
}

// ───────────────────────── Writes ─────────────────────────

export async function createBroadcast(workspaceId: string, input: CreateBroadcastInput, actorId?: string | null): Promise<Broadcast> {
  await assertPlanAllowsBroadcasts(workspaceId);
  await assertChannel(workspaceId, input.channelId);
  if (input.scheduledAt) {
    assertFuture(input.scheduledAt);
    await assertBroadcastQuota(workspaceId, { scheduledFor: input.scheduledAt });
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      workspaceId,
      channelId: input.channelId,
      name: input.name,
      message: toJson(input.message),
      audience: toJson(input.audience),
      scheduledAt: input.scheduledAt ?? null,
      status: input.scheduledAt ? BroadcastStatus.SCHEDULED : BroadcastStatus.DRAFT,
    },
  });
  await recordAudit({ workspaceId, userId: actorId, action: "broadcast.create", targetType: "broadcast", targetId: broadcast.id, metadata: { status: broadcast.status } });
  return broadcast;
}

/** Only DRAFT and SCHEDULED broadcasts are editable. `scheduledAt: null` turns a scheduled broadcast back into a draft. */
export async function updateBroadcast(workspaceId: string, id: string, input: UpdateBroadcastInput, actorId?: string | null): Promise<Broadcast> {
  const existing = await prisma.broadcast.findFirst({ where: { id, workspaceId }, select: { status: true, channelId: true } });
  if (!existing) throw notFound();
  if (existing.status !== BroadcastStatus.DRAFT && existing.status !== BroadcastStatus.SCHEDULED) {
    throw new ApiError(409, `A ${statusLabel(existing.status)} broadcast can't be edited`, "INVALID_STATE");
  }
  if (input.channelId && input.channelId !== existing.channelId) await assertChannel(workspaceId, input.channelId);
  if (input.scheduledAt) {
    assertFuture(input.scheduledAt);
    await assertBroadcastQuota(workspaceId, { scheduledFor: input.scheduledAt, excludeId: id });
  }

  const data: Prisma.BroadcastUncheckedUpdateManyInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.channelId !== undefined) data.channelId = input.channelId;
  if (input.message !== undefined) data.message = toJson(input.message);
  if (input.audience !== undefined) data.audience = toJson(input.audience);
  if (input.scheduledAt !== undefined) {
    data.scheduledAt = input.scheduledAt;
    data.status = input.scheduledAt ? BroadcastStatus.SCHEDULED : BroadcastStatus.DRAFT;
  }

  // Guarded by status so a concurrent send can't be overwritten back to DRAFT.
  const res = await prisma.broadcast.updateMany({
    where: { id, workspaceId, status: { in: [BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED] } },
    data,
  });
  if (res.count === 0) throw new ApiError(409, "This broadcast was sent or cancelled in the meantime", "INVALID_STATE");

  const broadcast = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
  await recordAudit({ workspaceId, userId: actorId, action: "broadcast.update", targetType: "broadcast", targetId: id, metadata: { status: broadcast.status } });
  return broadcast;
}

/** DRAFT/CANCELLED/SENT/FAILED can be deleted; delivery logs survive (FK is SetNull) so /logs keeps history. */
export async function deleteBroadcast(workspaceId: string, id: string, actorId?: string | null): Promise<void> {
  const deletable = [BroadcastStatus.DRAFT, BroadcastStatus.CANCELLED, BroadcastStatus.SENT, BroadcastStatus.FAILED];
  const res = await prisma.broadcast.deleteMany({ where: { id, workspaceId, status: { in: deletable } } });
  if (res.count === 0) {
    const existing = await prisma.broadcast.findFirst({ where: { id, workspaceId }, select: { status: true } });
    if (!existing) throw notFound();
    throw new ApiError(409, `Cancel the ${statusLabel(existing.status)} broadcast before deleting it`, "INVALID_STATE");
  }
  await recordAudit({ workspaceId, userId: actorId, action: "broadcast.delete", targetType: "broadcast", targetId: id });
}

/**
 * SCHEDULED/SENDING → CANCELLED. Queued sends are cancelled; running ones
 * notice the status and skip, and so does the fan-out at its next page.
 * `cancelledJobs` only counts sends already queued: people the fan-out had
 * not reached yet were never queued.
 */
export async function cancelBroadcast(workspaceId: string, id: string, actorId?: string | null): Promise<{ broadcast: Broadcast; cancelledJobs: number }> {
  const res = await prisma.broadcast.updateMany({
    where: { id, workspaceId, status: { in: [BroadcastStatus.SCHEDULED, BroadcastStatus.SENDING] } },
    data: { status: BroadcastStatus.CANCELLED, completedAt: new Date() },
  });
  if (res.count === 0) {
    const existing = await prisma.broadcast.findFirst({ where: { id, workspaceId }, select: { status: true } });
    if (!existing) throw notFound();
    throw new ApiError(409, `A ${statusLabel(existing.status)} broadcast can't be cancelled`, "INVALID_STATE");
  }
  const jobs = await prisma.job.updateMany({
    where: { workspaceId, type: JobType.BROADCAST_SEND, status: JobStatus.PENDING, dedupeKey: { startsWith: sendJobKeyPrefix(id) } },
    data: { status: JobStatus.CANCELLED, lockedAt: null, lockedBy: null },
  });
  const broadcast = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
  await recordAudit({ workspaceId, userId: actorId, action: "broadcast.cancel", targetType: "broadcast", targetId: id, metadata: { cancelledJobs: jobs.count } });
  logger.info("broadcast.cancelled", { broadcastId: id, workspaceId, cancelledJobs: jobs.count });
  return { broadcast, cancelledJobs: jobs.count };
}

// ───────────────────────── Sending ─────────────────────────

type CounterField = "sentCount" | "failedCount" | "skippedCount";

const counterSelect = { status: true, targetCount: true, sentCount: true, failedCount: true, skippedCount: true, fanoutCompletedAt: true } as const;

type Counters = Pick<Broadcast, "status" | "targetCount" | "sentCount" | "failedCount" | "skippedCount" | "fanoutCompletedAt">;

/**
 * Flip SENDING → SENT/FAILED once the whole audience is queued and every
 * targeted contact has an outcome. Until the fan-out's last page the target
 * only covers the pages read so far, so it can't be complete yet. The
 * status-guarded updateMany makes this safe to call from every job: exactly
 * one caller wins the transition.
 */
async function maybeComplete(id: string, counters: Counters): Promise<boolean> {
  if (counters.status !== BroadcastStatus.SENDING || !counters.fanoutCompletedAt) return false;
  if (counters.sentCount + counters.failedCount + counters.skippedCount < counters.targetCount) return false;
  const status = counters.sentCount === 0 && counters.failedCount > 0 ? BroadcastStatus.FAILED : BroadcastStatus.SENT;
  const res = await prisma.broadcast.updateMany({ where: { id, status: BroadcastStatus.SENDING }, data: { status, completedAt: new Date() } });
  if (res.count > 0) {
    logger.info("broadcast.completed", { broadcastId: id, status, sent: counters.sentCount, failed: counters.failedCount, skipped: counters.skippedCount, target: counters.targetCount });
  }
  return res.count > 0;
}

async function bumpCounter(id: string, field: CounterField): Promise<void> {
  const data: Prisma.BroadcastUpdateInput =
    field === "sentCount" ? { sentCount: { increment: 1 } } : field === "failedCount" ? { failedCount: { increment: 1 } } : { skippedCount: { increment: 1 } };
  const updated = await prisma.broadcast.update({ where: { id }, data, select: counterSelect });
  await maybeComplete(id, updated);
}

function counterFor(status: DeliveryStatus): CounterField {
  if (status === DeliveryStatus.SENT) return "sentCount";
  if (status === DeliveryStatus.FAILED) return "failedCount";
  return "skippedCount";
}

/**
 * DRAFT/SCHEDULED → SENDING, and no more: the audience is read by the
 * BROADCAST_FANOUT job queued here, a page at a time, so a large one never has
 * to fit in one request. The claim and the job are written together, so a
 * broadcast is never left SENDING with nothing to send it. Counters start at
 * zero and grow as the pages are read (see fanOutBroadcast).
 */
export async function sendBroadcast(workspaceId: string, id: string, actorId: string | null): Promise<SendBroadcastResult> {
  const broadcast = await prisma.broadcast.findFirst({ where: { id, workspaceId } });
  if (!broadcast) throw notFound();
  if (broadcast.status !== BroadcastStatus.DRAFT && broadcast.status !== BroadcastStatus.SCHEDULED) {
    throw new ApiError(409, `This broadcast is already ${statusLabel(broadcast.status)}`, "INVALID_STATE");
  }
  await assertPlanAllowsBroadcasts(workspaceId);
  await assertBroadcastQuota(workspaceId);

  const channel = await prisma.channel.findFirst({ where: { id: broadcast.channelId, workspaceId }, select: { id: true, status: true } });
  if (!channel) throw new ApiError(409, "The account this broadcast sends from is no longer connected", "CHANNEL_NOT_FOUND");
  if (channel.status !== ChannelStatus.ACTIVE) throw new ApiError(409, "Reconnect the channel before sending", "CHANNEL_INACTIVE");

  if (!parseBroadcastMessage(broadcast.message)) throw new ApiError(422, "The message is empty. Add text or an image.", "INVALID_MESSAGE");

  const payload: BroadcastFanoutPayload = { broadcastId: id, cursor: null, cursorCreatedAt: null, index: 0 };
  const claimed = await prisma.$transaction(async (tx) => {
    const res = await tx.broadcast.updateMany({
      where: { id, workspaceId, status: { in: [BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED] } },
      data: {
        status: BroadcastStatus.SENDING,
        startedAt: new Date(),
        completedAt: null,
        fanoutCompletedAt: null,
        targetCount: 0,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    });
    if (res.count === 0) return false;
    await tx.job.create({
      data: { type: JobType.BROADCAST_FANOUT, workspaceId, payload, dedupeKey: fanoutJobKey(id, null), maxAttempts: FANOUT_MAX_ATTEMPTS },
    });
    return true;
  });
  if (!claimed) throw new ApiError(409, "This broadcast is already being sent", "INVALID_STATE");

  await recordAudit({ workspaceId, userId: actorId, action: "broadcast.send", targetType: "broadcast", targetId: id });
  logger.info("broadcast.started", { broadcastId: id, workspaceId, channelId: channel.id, scheduled: actorId === null });
  return { broadcast: await prisma.broadcast.findUniqueOrThrow({ where: { id } }) };
}

type AudienceContact = { id: string; externalId: string; username: string | null };

/**
 * BROADCAST_FANOUT job handler (wired in lib/queue/handlers/broadcast-fanout.ts):
 * one page of the audience, the contacts after `cursor`. Everyone inside the
 * 24h window gets a BROADCAST_SEND job in their stagger slot, everyone else a
 * SKIPPED_WINDOW log, and the target grows by the page. The same transaction
 * queues the next page, or on the last page sets `fanoutCompletedAt`, which is
 * what lets the broadcast complete. A broadcast that is no longer SENDING
 * (cancelled) stops here.
 *
 * Pages follow (createdAt, id) rather than id alone: the (workspaceId,
 * createdAt) index serves that order, so a page reads about a page of rows,
 * where id order would read through the whole workspace for every page.
 */
export async function fanOutBroadcast(job: Job): Promise<void> {
  const parsed = broadcastFanoutPayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("broadcast.fanout_bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  const { broadcastId, cursor, cursorCreatedAt, index } = parsed.data;
  const after = cursor && cursorCreatedAt ? { id: cursor, createdAt: new Date(cursorCreatedAt) } : null;

  const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) {
    logger.warn("broadcast.fanout_orphaned", { jobId: job.id, broadcastId });
    return;
  }
  if (broadcast.status !== BroadcastStatus.SENDING || broadcast.fanoutCompletedAt) return;

  // Scoped by the broadcast's workspace: never by ids from the payload alone.
  const channel = await prisma.channel.findFirst({
    where: { id: broadcast.channelId, workspaceId: broadcast.workspaceId },
    select: { id: true, externalId: true },
  });
  // Removing an account removes its broadcasts, so only a race ends up here.
  if (!channel) return;

  // Membership is judged as of the moment it started: nobody who arrived since
  // is added, and "active in the last N days" counts back from then, so every
  // page answers the question the estimate answered.
  const startedAt = broadcast.startedAt ?? broadcast.createdAt;
  const rows = await prisma.contact.findMany({
    where: {
      AND: [
        audienceWhere(broadcast.workspaceId, channel, parseBroadcastAudience(broadcast.audience), startedAt),
        { createdAt: { lte: startedAt } },
        // (createdAt, id) > (after.createdAt, after.id), with the first half on its own so the index can range-scan.
        ...(after ? [{ createdAt: { gte: after.createdAt } }, { OR: [{ createdAt: { gt: after.createdAt } }, { id: { gt: after.id } }] }] : []),
      ],
    },
    select: {
      id: true,
      externalId: true,
      username: true,
      createdAt: true,
      conversations: { where: { channelId: channel.id }, select: { lastInboundAt: true }, take: 1 },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: FANOUT_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, FANOUT_PAGE_SIZE);
  const next = rows.length > FANOUT_PAGE_SIZE ? page[page.length - 1] : null;

  // The window is judged as each page is queued, the closer guess of who can
  // still be reached when their send runs (which checks it again).
  const cutoff = windowCutoff().getTime();
  const eligible: AudienceContact[] = [];
  const outside: AudienceContact[] = [];
  for (const c of page) {
    const last = c.conversations[0]?.lastInboundAt ?? null;
    const entry = { id: c.id, externalId: c.externalId, username: c.username };
    if (last && last.getTime() >= cutoff) eligible.push(entry);
    else outside.push(entry);
  }

  // A page can run twice (retried after its transaction committed), and nobody
  // may be counted twice. Whoever already has a send queued or an outcome
  // logged is left out: DeliveryLog has no unique key for skipDuplicates to use.
  const done = new Set<string>();
  if (page.length > 0) {
    const ids = page.map((c) => c.id);
    const prefix = sendJobKeyPrefix(broadcastId);
    const [queued, logged] = await Promise.all([
      prisma.job.findMany({ where: { dedupeKey: { in: ids.map((contactId) => sendJobKey(broadcastId, contactId)) } }, select: { dedupeKey: true } }),
      prisma.deliveryLog.findMany({ where: { broadcastId, contactId: { in: ids } }, select: { contactId: true } }),
    ]);
    for (const j of queued) if (j.dedupeKey) done.add(j.dedupeKey.slice(prefix.length));
    for (const l of logged) if (l.contactId) done.add(l.contactId);
  }
  // Slots follow the position in the page's eligible list, so a rerun puts everyone in the same minute.
  const sends = eligible.flatMap((contact, i) => (done.has(contact.id) ? [] : [{ contact, slot: index + i }]));
  const skips = outside.filter((c) => !done.has(c.id));

  const message = parseBroadcastMessage(broadcast.message);
  const preview = message ? messagePreview(message) : null;
  const start = startedAt.getTime();
  const lastPage = next === null;
  const now = new Date();

  const written = await prisma.$transaction(
    async (tx) => {
      // Goes first because it locks the row: a cancel landing meanwhile either waits for this page or stops it here.
      const live = await tx.broadcast.updateMany({
        where: { id: broadcastId, status: BroadcastStatus.SENDING, fanoutCompletedAt: null },
        data: {
          targetCount: { increment: sends.length + skips.length },
          skippedCount: { increment: skips.length },
          ...(lastPage ? { fanoutCompletedAt: now } : {}),
        },
      });
      if (live.count === 0) return false;
      if (skips.length > 0) {
        await tx.deliveryLog.createMany({
          data: skips.map((c) => ({
            workspaceId: broadcast.workspaceId,
            channelId: channel.id,
            broadcastId,
            contactId: c.id,
            kind: DeliveryKind.BROADCAST,
            status: DeliveryStatus.SKIPPED_WINDOW,
            recipientExternalId: c.externalId,
            recipientUsername: c.username,
            messagePreview: preview,
            errorMessage: "Outside the 24h messaging window at send time",
          })),
        });
      }
      if (sends.length > 0) {
        await tx.job.createMany({
          data: sends.map(({ contact, slot }) => {
            const payload: BroadcastJobPayload = { broadcastId, contactId: contact.id };
            return {
              type: JobType.BROADCAST_SEND,
              workspaceId: broadcast.workspaceId,
              payload,
              // The stagger counts from the start of the broadcast, across pages. A slot already past just runs now.
              runAt: new Date(start + Math.floor(slot / SEND_JOBS_PER_MINUTE) * 60_000),
              dedupeKey: sendJobKey(broadcastId, contact.id),
              maxAttempts: SEND_MAX_ATTEMPTS,
            };
          }),
          skipDuplicates: true,
        });
      }
      if (next) {
        const payload: BroadcastFanoutPayload = {
          broadcastId,
          cursor: next.id,
          cursorCreatedAt: next.createdAt.toISOString(),
          index: index + eligible.length,
        };
        await tx.job.createMany({
          data: [
            {
              type: JobType.BROADCAST_FANOUT,
              workspaceId: broadcast.workspaceId,
              payload,
              dedupeKey: fanoutJobKey(broadcastId, next.id),
              maxAttempts: FANOUT_MAX_ATTEMPTS,
            },
          ],
          skipDuplicates: true,
        });
      }
      return true;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  if (!written) return;

  logger.debug("broadcast.fanout_page", { broadcastId, queued: sends.length, skippedWindow: skips.length, lastPage });
  if (!lastPage) return;

  const counters = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: counterSelect });
  if (!counters) return;
  logger.info("broadcast.fanout_done", { broadcastId, target: counters.targetCount });
  // Everyone may have an outcome already: all outside the window, or the sends finished before the last page.
  await maybeComplete(broadcastId, counters);
}

/**
 * BROADCAST_SEND job handler (wired in lib/queue/handlers/broadcast-send.ts).
 * Payload: { broadcastId, contactId, rateLimitRetries? }.
 *
 * Rate limits are handled by re-enqueueing at `retryAt` (up to 6h after the
 * broadcast started) rather than throwing, so the job's attempt budget is
 * reserved for real failures (network / 5xx), which do throw and back off.
 */
export async function sendBroadcastMessage(job: Job): Promise<void> {
  const parsed = broadcastJobPayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("broadcast.bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  const { broadcastId, contactId } = parsed.data;
  const retries = parsed.data.rateLimitRetries ?? 0;

  const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) {
    logger.warn("broadcast.job_orphaned", { jobId: job.id, broadcastId });
    return;
  }
  if (broadcast.status === BroadcastStatus.CANCELLED) {
    logger.info("broadcast.job_skipped_cancelled", { jobId: job.id, broadcastId, contactId });
    return;
  }
  if (broadcast.status !== BroadcastStatus.SENDING) {
    logger.warn("broadcast.job_wrong_state", { jobId: job.id, broadcastId, status: broadcast.status });
    return;
  }

  // Everything below is scoped by the broadcast's workspace: never by ids from the payload alone.
  const [channel, contact] = await Promise.all([
    prisma.channel.findFirst({ where: { id: broadcast.channelId, workspaceId: broadcast.workspaceId } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: broadcast.workspaceId, channelId: broadcast.channelId } }),
  ]);
  if (!channel || !contact) {
    // Deleted between enqueue and send; count it so the broadcast can still complete.
    logger.warn("broadcast.job_target_missing", { jobId: job.id, broadcastId, contactId, channelMissing: !channel, contactMissing: !contact });
    await bumpCounter(broadcastId, "skippedCount");
    return;
  }

  // A retried job (worker crash after the send) must not DM the contact twice.
  const already = await prisma.deliveryLog.findFirst({
    where: { broadcastId, contactId, kind: DeliveryKind.BROADCAST },
    select: { id: true },
  });
  if (already) {
    logger.info("broadcast.job_already_delivered", { jobId: job.id, broadcastId, contactId });
    return;
  }

  const message = parseBroadcastMessage(broadcast.message);
  if (!message) {
    await recordDeliveryLog({
      workspaceId: broadcast.workspaceId,
      channelId: channel.id,
      broadcastId,
      contactId,
      kind: DeliveryKind.BROADCAST,
      status: DeliveryStatus.FAILED,
      recipientExternalId: contact.externalId,
      recipientUsername: contact.username,
      errorMessage: "Broadcast message is empty or malformed",
    });
    await bumpCounter(broadcastId, "failedCount");
    return;
  }

  const result = await sendToContact({ channel, contact, message, broadcastId, kind: DeliveryKind.BROADCAST });

  if (result.retryable) {
    const startedAt = broadcast.startedAt ?? broadcast.createdAt;
    const ageMs = Date.now() - startedAt.getTime();
    if (ageMs < RATE_LIMIT_MAX_DEFER_MS) {
      const now = Date.now();
      const base = result.retryAt && result.retryAt.getTime() > now ? result.retryAt.getTime() : now + 60_000;
      const runAt = new Date(base + Math.floor(Math.random() * 15_000));
      const next = retries + 1;
      const payload: BroadcastJobPayload = { broadcastId, contactId, rateLimitRetries: next };
      await enqueue({
        type: JobType.BROADCAST_SEND,
        workspaceId: broadcast.workspaceId,
        payload,
        runAt,
        dedupeKey: `${sendJobKey(broadcastId, contactId)}:rl:${next}`,
        maxAttempts: SEND_MAX_ATTEMPTS,
      });
      logger.info("broadcast.deferred_rate_limit", { broadcastId, contactId, retries: next, runAt: runAt.toISOString() });
      return;
    }
    await recordDeliveryLog({
      workspaceId: broadcast.workspaceId,
      channelId: channel.id,
      broadcastId,
      contactId,
      kind: DeliveryKind.BROADCAST,
      status: DeliveryStatus.SKIPPED_RATE_LIMIT,
      recipientExternalId: contact.externalId,
      recipientUsername: contact.username,
      messagePreview: messagePreview(message),
      errorMessage: `Rate limited for ${Math.round(ageMs / 3_600_000)}h, giving up`,
    });
    await bumpCounter(broadcastId, "skippedCount");
    return;
  }

  await bumpCounter(broadcastId, counterFor(result.status));
}

// ───────────────────────── Scheduling ─────────────────────────

/**
 * Whether any job of this type whose dedupe key starts with `keyPrefix` is
 * still waiting or running. Only asked about broadcasts that look stuck, and
 * it stops at the first match within the live part of the queue.
 */
async function hasLiveJob(type: JobType, keyPrefix: string): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { type, status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] }, dedupeKey: { startsWith: keyPrefix } },
    select: { id: true },
  });
  return job !== null;
}

/**
 * The fan-out stopped before its last page and nothing will pick it up again
 * (its job ran out of attempts). Stop adding people: whoever was queued still
 * gets it and completes the broadcast. With nobody queued it never went out,
 * so it is FAILED.
 */
async function closeAbandonedFanout(id: string, targetCount: number, now: Date): Promise<boolean> {
  if (targetCount === 0) {
    const res = await prisma.broadcast.updateMany({
      where: { id, status: BroadcastStatus.SENDING, fanoutCompletedAt: null, targetCount: 0 },
      data: { status: BroadcastStatus.FAILED, fanoutCompletedAt: now, completedAt: now },
    });
    if (res.count > 0) logger.error("broadcast.fanout_abandoned", { broadcastId: id, queued: 0 });
    return res.count > 0;
  }
  const res = await prisma.broadcast.updateMany({
    where: { id, status: BroadcastStatus.SENDING, fanoutCompletedAt: null },
    data: { fanoutCompletedAt: now },
  });
  if (res.count === 0) return false;
  logger.error("broadcast.fanout_abandoned", { broadcastId: id, queued: targetCount });
  const counters = await prisma.broadcast.findUnique({ where: { id }, select: counterSelect });
  return counters ? maybeComplete(id, counters) : false;
}

/**
 * The safety net behind maybeComplete, for SENDING broadcasts whose counters
 * haven't moved for STUCK_SENDING_GRACE_MS. Anything with a job still waiting
 * is left alone, so after a worker outage the queue carries on where it was.
 * Otherwise: a fan-out that died is closed out; a broadcast whose contacts
 * all have an outcome but whose completion was missed is completed; and
 * contacts still without an outcome once none of the sends is left (they ran
 * out of attempts) are counted as failed, because they did fail.
 */
async function finalizeStuckBroadcasts(now: Date): Promise<string[]> {
  const candidates = await prisma.broadcast.findMany({
    where: { status: BroadcastStatus.SENDING, updatedAt: { lt: new Date(now.getTime() - STUCK_SENDING_GRACE_MS) } },
    select: { id: true, ...counterSelect },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  const finalized: string[] = [];
  for (const b of candidates) {
    if (!b.fanoutCompletedAt) {
      if (await hasLiveJob(JobType.BROADCAST_FANOUT, fanoutJobKeyPrefix(b.id))) continue;
      if (await closeAbandonedFanout(b.id, b.targetCount, now)) finalized.push(b.id);
      continue;
    }
    const gap = b.targetCount - (b.sentCount + b.failedCount + b.skippedCount);
    let counters: Counters = b;
    if (gap > 0) {
      if (await hasLiveJob(JobType.BROADCAST_SEND, sendJobKeyPrefix(b.id))) continue;
      counters = await prisma.broadcast.update({ where: { id: b.id }, data: { failedCount: { increment: gap } }, select: counterSelect });
    }
    if (await maybeComplete(b.id, counters)) {
      finalized.push(b.id);
      if (gap > 0) logger.warn("broadcast.finalized_stuck", { broadcastId: b.id, attributedFailures: gap });
    }
  }
  return finalized;
}

/**
 * Starts every SCHEDULED broadcast whose time has come (the same path as
 * sending one now), then finalizes stuck ones. Idempotent and safe to run
 * concurrently (the SENDING claim is atomic). The worker runs it every
 * minute, and so does `/api/cron/tick` for deployments without one.
 */
export async function processDueBroadcasts(now = new Date()): Promise<ProcessDueResult> {
  const due = await prisma.broadcast.findMany({
    where: { status: BroadcastStatus.SCHEDULED, scheduledAt: { lte: now } },
    select: { id: true, workspaceId: true },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });

  const started: string[] = [];
  const failed: ProcessDueResult["failed"] = [];
  for (const b of due) {
    try {
      await sendBroadcast(b.workspaceId, b.id, null);
      started.push(b.id);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ id: b.id, error });
      // Another tick claimed it first: nothing to do.
      if (err instanceof ApiError && err.code === "INVALID_STATE") continue;
      // Expected, permanent problems (plan downgrade, channel gone) mark it FAILED;
      // anything else (DB hiccup) stays SCHEDULED and is retried next tick.
      if (err instanceof ApiError) {
        await prisma.broadcast.updateMany({ where: { id: b.id, status: BroadcastStatus.SCHEDULED }, data: { status: BroadcastStatus.FAILED, completedAt: now } });
        logger.warn("broadcast.scheduled_failed", { broadcastId: b.id, workspaceId: b.workspaceId, code: err.code, error });
      } else {
        logger.error("broadcast.scheduled_error", { broadcastId: b.id, workspaceId: b.workspaceId, error });
      }
    }
  }

  const finalized = await finalizeStuckBroadcasts(now);
  if (started.length || failed.length || finalized.length) {
    logger.info("broadcast.process_due", { started: started.length, failed: failed.length, finalized: finalized.length });
  }
  return { started, failed, finalized };
}
