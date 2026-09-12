/**
 * Segments — saved contact filters.
 *
 * `buildContactWhere` is the only translation from the filter shape to a
 * Prisma predicate. The contacts list and CSV export, segment counts, the
 * contact page's "Segments" chips and the broadcast audience estimate/send all
 * go through it, so a number shown in one place is the same number everywhere
 * else. Every function takes `workspaceId` first and scopes each query by it.
 *
 * This module is a leaf on purpose (no import from contacts/broadcasts): both
 * of those consume it, and a cycle here would break module evaluation order.
 */
import { ChannelPlatform, ContactSource, Prisma, type Segment } from "@prisma/client";
import { z } from "zod";

import { MAX_TAG_LENGTH } from "@/lib/automation/flow-types";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── Limits ─────────────────────────

export const MAX_SEGMENTS_PER_WORKSPACE = 50;
export const SEGMENT_NAME_MAX_LENGTH = 60;
export const SEGMENT_DESCRIPTION_MAX_LENGTH = 200;
export const SEGMENT_MAX_FILTER_TAGS = 50;
export const SEGMENT_MAX_LAST_INTERACTION_DAYS = 365;
export const SEGMENT_MAX_QUERY_LENGTH = 120;
/** Longest stage name accepted in a filter (mirrors `PIPELINE_STAGE_MAX_LENGTH`; defined here to keep this module a leaf). */
export const SEGMENT_MAX_STAGE_LENGTH = 24;
/** Sentinel for `ownerId`: contacts with no owner. Not a real user id, so it can never collide. */
export const SEGMENT_OWNER_UNASSIGNED = "unassigned";
/** A contact's "Segments" chip list evaluates at most this many segments. */
export const SEGMENT_MATCH_LIMIT = 20;
/** Live counts run this many count queries at a time so a big list can't drain the pool. */
const COUNT_CONCURRENCY = 8;
const DAY_MS = 24 * 3600 * 1000;

// ───────────────────────── Tag primitives ─────────────────────────
// Defined here (not in contacts.ts) because contacts.ts imports this module;
// contacts.ts re-exports them so its public surface is unchanged.

/** A single tag: trimmed, non-empty, bounded. Case is preserved (tags are user-facing labels). */
export const tagSchema = z.string().trim().min(1, "Tag can't be empty").max(MAX_TAG_LENGTH, `Tags must be ${MAX_TAG_LENGTH} characters or fewer`);

/** Dedupe while preserving first-seen order so a user's tag ordering survives edits. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export const tagMatchModeSchema = z.enum(["all", "any"]);
export type TagMatchMode = z.infer<typeof tagMatchModeSchema>;

// ───────────────────────── Filters ─────────────────────────

const filterTagList = z.array(tagSchema).max(SEGMENT_MAX_FILTER_TAGS).transform(normalizeTags);

/**
 * The one filter vocabulary. Semantics (see `buildContactWhere`):
 * - `tags` + `tagMode` ("all" when omitted): the contact carries every / at least one of them.
 * - `excludeTags`: the contact carries none of them.
 * - `onlyFollowers`: isFollower = true. `excludeFollowers`: not a known follower
 *   (includes "unknown" — follow status is only learned during a follow gate). `onlyFollowers` wins if both are set.
 * - `lastInteractionDays`: lastInteractionAt within the last N days (contacts that never interacted are excluded).
 * - `excludeOptedOut`: optedOut = false. `optedOut`: exact match, used by the raw list API; `excludeOptedOut` wins if both are set.
 * - `q`: case-insensitive substring on username, name or email (a leading "@" is ignored).
 * CRM keys (all additive):
 * - `stage`: exact pipeline stage name. `ownerId`: a member's user id, or `SEGMENT_OWNER_UNASSIGNED`.
 * - `source`: how the contact entered (WEBHOOK / IMPORT / MANUAL).
 * - `hasEmail` / `hasPhone`: true = field present, false = field empty.
 * - `messageable`: true = reachable over DM (has a Meta id); false = CRM-only records.
 */
const segmentFiltersBase = z.object({
  q: z.string().trim().max(SEGMENT_MAX_QUERY_LENGTH).optional(),
  channelId: z.string().min(1).max(64).optional(),
  platform: z.nativeEnum(ChannelPlatform).optional(),
  tags: filterTagList.optional(),
  tagMode: tagMatchModeSchema.optional(),
  excludeTags: filterTagList.optional(),
  onlyFollowers: z.boolean().optional(),
  excludeFollowers: z.boolean().optional(),
  lastInteractionDays: z.number().int().min(1).max(SEGMENT_MAX_LAST_INTERACTION_DAYS).optional(),
  excludeOptedOut: z.boolean().optional(),
  optedOut: z.boolean().optional(),
  stage: z.string().trim().min(1).max(SEGMENT_MAX_STAGE_LENGTH).optional(),
  ownerId: z.string().min(1).max(64).optional(),
  source: z.nativeEnum(ContactSource).optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  messageable: z.boolean().optional(),
});

/** API input: unknown keys are rejected so a misspelt filter can't silently widen an audience. */
export const segmentFiltersSchema = segmentFiltersBase.strict();
export type SegmentFilters = z.infer<typeof segmentFiltersSchema>;

export const EMPTY_SEGMENT_FILTERS: SegmentFilters = {};

/**
 * Canonical form: only keys that change the predicate, tags deduped, `tagMode`
 * only when there are tags. Stored rows and equality checks use this so two
 * ways of saying "no filter" compare equal.
 */
export function compactSegmentFilters(filters: SegmentFilters): SegmentFilters {
  const out: SegmentFilters = {};
  const q = filters.q?.trim();
  if (q) out.q = q;
  if (filters.channelId) out.channelId = filters.channelId;
  if (filters.platform) out.platform = filters.platform;
  const tags = normalizeTags(filters.tags ?? []);
  if (tags.length > 0) {
    out.tags = tags;
    if (filters.tagMode === "any") out.tagMode = "any";
  }
  const excludeTags = normalizeTags(filters.excludeTags ?? []);
  if (excludeTags.length > 0) out.excludeTags = excludeTags;
  if (filters.onlyFollowers) out.onlyFollowers = true;
  else if (filters.excludeFollowers) out.excludeFollowers = true;
  if (filters.lastInteractionDays) out.lastInteractionDays = filters.lastInteractionDays;
  if (filters.excludeOptedOut) out.excludeOptedOut = true;
  else if (filters.optedOut !== undefined) out.optedOut = filters.optedOut;
  const stage = filters.stage?.trim();
  if (stage) out.stage = stage;
  if (filters.ownerId) out.ownerId = filters.ownerId;
  if (filters.source) out.source = filters.source;
  if (filters.hasEmail !== undefined) out.hasEmail = filters.hasEmail;
  if (filters.hasPhone !== undefined) out.hasPhone = filters.hasPhone;
  if (filters.messageable !== undefined) out.messageable = filters.messageable;
  return out;
}

/**
 * Tolerant read of stored JSON. Unknown keys are dropped (an older build may
 * read a newer row); an unusable value logs and falls back to "everyone" so a
 * list keeps rendering — callers that send messages must still confirm counts.
 */
export function parseSegmentFilters(json: Prisma.JsonValue | null | undefined, meta?: { segmentId?: string }): SegmentFilters {
  const parsed = segmentFiltersBase.safeParse(json ?? {});
  if (parsed.success) return compactSegmentFilters(parsed.data);
  logger.warn("segment.bad_filters", { ...meta, issues: parsed.error.issues });
  return EMPTY_SEGMENT_FILTERS;
}

/**
 * THE filter → Prisma translation. Always scoped by workspaceId; `now` is
 * injectable so a list and its counts evaluate relative-time filters at the
 * same instant.
 */
export function buildContactWhere(workspaceId: string, filters: SegmentFilters, now = new Date()): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { workspaceId };

  const q = filters.q?.trim().replace(/^@/, "");
  if (q) {
    where.OR = [
      { username: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters.channelId) where.channelId = filters.channelId;
  if (filters.platform) where.platform = filters.platform;

  const tags = normalizeTags(filters.tags ?? []);
  if (tags.length > 0) where.tags = filters.tagMode === "any" ? { hasSome: tags } : { hasEvery: tags };

  const excludeTags = normalizeTags(filters.excludeTags ?? []);
  if (excludeTags.length > 0) where.NOT = { tags: { hasSome: excludeTags } };

  if (filters.onlyFollowers) where.isFollower = true;
  // "Not a follower" includes unknown — we only learn follower status during a follow gate.
  else if (filters.excludeFollowers) where.isFollower = { not: true };

  if (filters.lastInteractionDays) {
    where.lastInteractionAt = { gte: new Date(now.getTime() - filters.lastInteractionDays * DAY_MS) };
  }

  if (filters.excludeOptedOut) where.optedOut = false;
  else if (filters.optedOut !== undefined) where.optedOut = filters.optedOut;

  const stage = filters.stage?.trim();
  if (stage) where.stage = stage;
  if (filters.ownerId) where.ownerId = filters.ownerId === SEGMENT_OWNER_UNASSIGNED ? null : filters.ownerId;
  if (filters.source) where.source = filters.source;
  // "Present" means a non-empty string; imports never write "" but a manual edit could clear it to null.
  if (filters.hasEmail !== undefined) where.email = filters.hasEmail ? { not: null } : null;
  if (filters.hasPhone !== undefined) where.phone = filters.hasPhone ? { not: null } : null;
  if (filters.messageable !== undefined) where.messageable = filters.messageable;

  return where;
}

export function countContacts(workspaceId: string, filters: SegmentFilters, now = new Date()): Promise<number> {
  return prisma.contact.count({ where: buildContactWhere(workspaceId, filters, now) });
}

// ───────────────────────── Validation ─────────────────────────

export const segmentNameSchema = z.string().trim().min(1, "Give the segment a name").max(SEGMENT_NAME_MAX_LENGTH, `Names are at most ${SEGMENT_NAME_MAX_LENGTH} characters`);

export const createSegmentSchema = z
  .object({
    name: segmentNameSchema,
    description: z.string().trim().max(SEGMENT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    filters: segmentFiltersSchema,
  })
  .strict();

export const updateSegmentSchema = createSegmentSchema.partial().refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" });

export const previewSegmentSchema = z.object({ filters: segmentFiltersSchema }).strict();

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;

// ───────────────────────── Types ─────────────────────────

/** JSON-safe row (dates as ISO strings) so it crosses both the RSC boundary and the API unchanged. */
export type SegmentSummary = {
  id: string;
  name: string;
  description: string | null;
  filters: SegmentFilters;
  /** Contacts matching `filters` right now. */
  count: number;
  createdAt: string;
  updatedAt: string;
};

export type SegmentMatch = Pick<SegmentSummary, "id" | "name">;

function toSummary(row: Segment, count: number): SegmentSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    filters: parseSegmentFilters(row.filters, { segmentId: row.id }),
    count,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    out.push(...(await Promise.all(items.slice(i, i + concurrency).map(fn))));
  }
  return out;
}

// ───────────────────────── Reads ─────────────────────────

/** Segments with live counts — one count query per segment, a few at a time. */
export async function listSegments(workspaceId: string): Promise<SegmentSummary[]> {
  const rows = await prisma.segment.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, take: MAX_SEGMENTS_PER_WORKSPACE });
  const now = new Date();
  const counts = await mapConcurrent(rows, COUNT_CONCURRENCY, (row) =>
    prisma.contact.count({ where: buildContactWhere(workspaceId, parseSegmentFilters(row.filters, { segmentId: row.id }), now) }),
  );
  return rows.map((row, i) => toSummary(row, counts[i] ?? 0));
}

export async function getSegment(workspaceId: string, id: string): Promise<SegmentSummary | null> {
  const row = await prisma.segment.findFirst({ where: { id, workspaceId } });
  if (!row) return null;
  const count = await countContacts(workspaceId, parseSegmentFilters(row.filters, { segmentId: row.id }));
  return toSummary(row, count);
}

/**
 * Saved segments this contact currently falls into. Each segment's predicate
 * is ANDed with the contact id, so it is exactly the list membership test —
 * capped so a workspace with many segments can't turn a profile page into 50 queries.
 */
export async function segmentsForContact(workspaceId: string, contactId: string): Promise<{ segments: SegmentMatch[]; truncated: boolean }> {
  // One extra row tells us whether the cap cut anything off, without a second count query.
  const rows = await prisma.segment.findMany({
    where: { workspaceId },
    select: { id: true, name: true, filters: true },
    orderBy: { name: "asc" },
    take: SEGMENT_MATCH_LIMIT + 1,
  });
  const truncated = rows.length > SEGMENT_MATCH_LIMIT;
  const evaluated = truncated ? rows.slice(0, SEGMENT_MATCH_LIMIT) : rows;
  const now = new Date();
  const hits = await mapConcurrent(evaluated, COUNT_CONCURRENCY, (row) =>
    prisma.contact.count({
      where: { AND: [buildContactWhere(workspaceId, parseSegmentFilters(row.filters, { segmentId: row.id }), now), { id: contactId }] },
    }),
  );
  return { segments: evaluated.filter((_, i) => (hits[i] ?? 0) > 0).map((row) => ({ id: row.id, name: row.name })), truncated };
}

// ───────────────────────── Writes ─────────────────────────

function notFound(): ApiError {
  return new ApiError(404, "Segment not found", "NOT_FOUND");
}

/** The unique index is case-sensitive; "VIP" and "vip" side by side would only confuse the rail. */
async function assertNameFree(workspaceId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await prisma.segment.findFirst({
    where: { workspaceId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ApiError(409, `A segment named “${name}” already exists`, "CONFLICT");
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function toJson(filters: SegmentFilters): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(compactSegmentFilters(filters))) as Prisma.InputJsonObject;
}

export async function createSegment(workspaceId: string, input: CreateSegmentInput, actorId?: string | null): Promise<SegmentSummary> {
  const data = createSegmentSchema.parse(input);
  const total = await prisma.segment.count({ where: { workspaceId } });
  if (total >= MAX_SEGMENTS_PER_WORKSPACE) {
    throw new ApiError(409, `A workspace can have at most ${MAX_SEGMENTS_PER_WORKSPACE} segments`, "LIMIT");
  }
  await assertNameFree(workspaceId, data.name);

  let row: Segment;
  try {
    row = await prisma.segment.create({
      data: { workspaceId, name: data.name, description: data.description || null, filters: toJson(data.filters) },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, `A segment named “${data.name}” already exists`, "CONFLICT");
    throw err;
  }
  await recordAudit({ workspaceId, userId: actorId, action: "segment.create", targetType: "segment", targetId: row.id, metadata: { name: row.name } });
  logger.info("segment.created", { workspaceId, segmentId: row.id });
  return toSummary(row, await countContacts(workspaceId, data.filters));
}

export async function updateSegment(workspaceId: string, id: string, input: UpdateSegmentInput, actorId?: string | null): Promise<SegmentSummary> {
  const data = updateSegmentSchema.parse(input);
  const existing = await prisma.segment.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) throw notFound();
  if (data.name !== undefined) await assertNameFree(workspaceId, data.name, id);

  const update: Prisma.SegmentUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description || null;
  if (data.filters !== undefined) update.filters = toJson(data.filters);

  let row: Segment;
  try {
    // updateMany + re-read keeps the workspace scope on the write itself, not just on the pre-check.
    const res = await prisma.segment.updateMany({ where: { id, workspaceId }, data: update });
    if (res.count === 0) throw notFound();
    row = await prisma.segment.findUniqueOrThrow({ where: { id } });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, `A segment named “${data.name}” already exists`, "CONFLICT");
    throw err;
  }
  await recordAudit({ workspaceId, userId: actorId, action: "segment.update", targetType: "segment", targetId: id, metadata: { fields: Object.keys(data) } });
  logger.info("segment.updated", { workspaceId, segmentId: id, fields: Object.keys(data) });
  return toSummary(row, await countContacts(workspaceId, parseSegmentFilters(row.filters, { segmentId: row.id })));
}

/** Broadcasts keep their own copy of the filters, so deleting a segment never changes a scheduled send. */
export async function deleteSegment(workspaceId: string, id: string, actorId?: string | null): Promise<void> {
  const res = await prisma.segment.deleteMany({ where: { id, workspaceId } });
  if (res.count === 0) throw notFound();
  await recordAudit({ workspaceId, userId: actorId, action: "segment.delete", targetType: "segment", targetId: id });
  logger.info("segment.deleted", { workspaceId, segmentId: id });
}
