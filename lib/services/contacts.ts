/**
 * Contacts — everyone who ever commented, messaged or tapped a button on a
 * connected account, plus CRM-only records added by hand or by CSV import.
 * Every function takes `workspaceId` first and scopes each query by it;
 * contact ids from the client are never trusted alone.
 *
 * Dates on list rows are ISO strings so the same shape can cross both the
 * RSC prop boundary and the JSON API unchanged. Detail rows keep `Date`
 * except the merged timeline, which is consumed by a client component.
 */
import { randomUUID } from "node:crypto";

import {
  ChannelPlatform,
  ContactSource,
  DeliveryKind,
  DeliveryStatus,
  Prisma,
  type ChannelStatus,
  type Contact,
  type ConversationStatus,
  type DeliveryLog,
  type FlowSessionStatus,
  type MessageDirection,
  type WorkspaceRole,
} from "@prisma/client";
import { z } from "zod";

import { isWithinWindow, MESSAGING_WINDOW_MS } from "@/lib/automation/send";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listNotes, type ContactNoteSummary } from "@/lib/services/contact-notes";
import { getStages, requireStage } from "@/lib/services/pipeline";
import {
  buildContactWhere,
  compactSegmentFilters,
  normalizeTags,
  SEGMENT_MAX_LAST_INTERACTION_DAYS,
  SEGMENT_MAX_STAGE_LENGTH,
  SEGMENT_OWNER_UNASSIGNED,
  type SegmentFilters,
  type SegmentMatch,
  segmentsForContact,
  tagMatchModeSchema,
  tagSchema,
  type TagMatchMode,
} from "@/lib/services/segments";
import { recordAudit } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";

// Tag primitives live in segments.ts (the filter module both services share); re-exported so callers are unaffected.
export { normalizeTags, tagMatchModeSchema, tagSchema, type TagMatchMode };

// ───────────────────────── Limits ─────────────────────────

export const CONTACT_LIST_DEFAULT_LIMIT = 50;
export const CONTACT_LIST_MAX_LIMIT = 100;
/** Bulk actions cap: keeps a single request (and its transaction) bounded. */
export const CONTACT_BULK_MAX_IDS = 500;
export const CONTACT_MAX_TAGS = 100;
export const CONTACT_MAX_CUSTOM_FIELDS = 50;
export const CONTACT_MAX_FIELD_KEY_LENGTH = 64;
export const CONTACT_MAX_FIELD_VALUE_LENGTH = 1000;
export const CONTACT_MAX_NAME_LENGTH = 120;
export const CONTACT_MAX_EMAIL_LENGTH = 254;
export const CONTACT_MAX_PHONE_LENGTH = 32;
export const CONTACT_MAX_USERNAME_LENGTH = 64;
/** Export ceiling — beyond this, a CSV in one response is the wrong tool. */
export const CONTACT_EXPORT_MAX_ROWS = 50_000;
/** Timeline rows on the profile page after merging every source. */
export const CONTACT_TIMELINE_MAX = 150;
/** AuditLog action written whenever a contact's stage changes — the timeline reads it back. */
export const AUDIT_STAGE_CHANGED = "contact.stage_changed";
const EXPORT_PAGE_SIZE = 1000;
const DETAIL_ACTIVITY_LIMIT = 40;
const DETAIL_NOTES_LIMIT = 50;
const DETAIL_STAGE_CHANGES_LIMIT = 50;
/** Only these DeliveryLog kinds are DMs the contact actually received. */
const DM_KINDS: DeliveryKind[] = [DeliveryKind.PRIVATE_REPLY, DeliveryKind.MESSAGE, DeliveryKind.BROADCAST];

// ───────────────────────── Normalisers ─────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{7,15}$/;

/** Lower-cased, trimmed email — or null when the input isn't one. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  return value && value.length <= CONTACT_MAX_EMAIL_LENGTH && EMAIL_RE.test(value) ? value : null;
}

/** Digits with an optional leading "+" (7–15 digits, per E.164) — or null when the input isn't a phone number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = (raw ?? "").replace(/[\s().-]/g, "");
  return value && PHONE_RE.test(value) ? value : null;
}

/** Handles are stored without the leading "@"; Instagram handles are case-insensitive so matching lower-cases both sides. */
export function normalizeUsername(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/^@+/, "") ?? "";
  return value ? value.slice(0, CONTACT_MAX_USERNAME_LENGTH) : null;
}

// ───────────────────────── Validation ─────────────────────────

/** `lastInteraction`/`createdAt` are the CRM-facing names of `recent`/`newest`; both spellings are accepted everywhere. */
export const contactSortSchema = z.enum(["recent", "newest", "name", "lastInteraction", "stage", "createdAt"]);
export type ContactSort = z.infer<typeof contactSortSchema>;

const tagArraySchema = z.array(tagSchema).max(CONTACT_MAX_TAGS).transform(normalizeTags);

const customFieldValueSchema = z.union([z.string().max(CONTACT_MAX_FIELD_VALUE_LENGTH), z.number(), z.boolean(), z.null()]);

export const customFieldsSchema = z
  .record(z.string().trim().min(1).max(CONTACT_MAX_FIELD_KEY_LENGTH), customFieldValueSchema)
  .refine((obj) => Object.keys(obj).length <= CONTACT_MAX_CUSTOM_FIELDS, {
    message: `At most ${CONTACT_MAX_CUSTOM_FIELDS} custom fields per contact`,
  });

export type CustomFields = z.infer<typeof customFieldsSchema>;

const stageFieldSchema = z.string().trim().min(1, "Pick a stage").max(SEGMENT_MAX_STAGE_LENGTH);
/** Raw text: empty string clears the field; anything else must normalise to a valid value (checked in the service). */
const emailFieldSchema = z.string().trim().max(CONTACT_MAX_EMAIL_LENGTH).nullable();
const phoneFieldSchema = z.string().trim().max(CONTACT_MAX_PHONE_LENGTH).nullable();

/**
 * PATCH /api/contacts/[id] body. The Inbox lane sends the tags/customFields/
 * optedOut/name subset; the CRM UI adds stage, owner, email and phone.
 */
export const updateContactSchema = z
  .object({
    tags: tagArraySchema.optional(),
    customFields: customFieldsSchema.optional(),
    optedOut: z.boolean().optional(),
    name: z.string().trim().max(CONTACT_MAX_NAME_LENGTH).nullable().optional(),
    stage: stageFieldSchema.optional(),
    /** A workspace member's user id, or null to unassign. */
    ownerId: z.string().min(1).max(64).nullable().optional(),
    email: emailFieldSchema.optional(),
    phone: phoneFieldSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

const idListSchema = z.array(z.string().min(1).max(64)).min(1, "Select at least one contact").max(CONTACT_BULK_MAX_IDS);

export const bulkIdsSchema = z.object({ ids: idListSchema }).strict();

export const bulkTagsSchema = z
  .object({
    ids: idListSchema,
    add: tagArraySchema.default([]),
    remove: tagArraySchema.default([]),
  })
  .strict()
  .refine((data) => data.add.length > 0 || data.remove.length > 0, { message: "Provide tags to add or remove" });

export type BulkTagsInput = z.infer<typeof bulkTagsSchema>;

/** POST /api/contacts/bulk — every key is optional but at least one action must be present. */
export const bulkUpdateSchema = z
  .object({
    ids: idListSchema,
    stage: stageFieldSchema.optional(),
    ownerId: z.string().min(1).max(64).nullable().optional(),
    addTags: tagArraySchema.optional(),
    removeTags: tagArraySchema.optional(),
  })
  .strict()
  .refine((d) => d.stage !== undefined || d.ownerId !== undefined || (d.addTags?.length ?? 0) > 0 || (d.removeTags?.length ?? 0) > 0, {
    message: "Nothing to apply",
  });

export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;

export const renameTagSchema = z
  .object({ from: tagSchema, to: tagSchema })
  .strict()
  .refine((d) => d.from !== d.to, { message: "New name must differ from the current one" });

export const deleteTagSchema = z.object({ tag: tagSchema }).strict();

/** POST /api/contacts — a CRM-only record; it becomes messageable once the person interacts (see `adoptManualContact`). */
export const createManualContactSchema = z
  .object({
    channelId: z.string().min(1).max(64),
    name: z.string().trim().min(1, "Give the contact a name").max(CONTACT_MAX_NAME_LENGTH),
    username: z.string().trim().max(CONTACT_MAX_USERNAME_LENGTH).optional(),
    email: z.string().trim().max(CONTACT_MAX_EMAIL_LENGTH).optional(),
    phone: z.string().trim().max(CONTACT_MAX_PHONE_LENGTH).optional(),
    stage: stageFieldSchema.optional(),
    tags: tagArraySchema.optional(),
  })
  .strict();

export type CreateManualContactInput = z.infer<typeof createManualContactSchema>;

const boolFromQuery = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .optional();

const tagListFromQuery = z
  .string()
  .optional()
  .transform((v) => normalizeTags((v ?? "").split(",")).slice(0, 20));

/**
 * `?q=&channelId=&platform=&tags=a,b&tagMode=all&excludeTags=c&follower=true&lastInteractionDays=7&excludeOptedOut=true&optedOut=false
 *   &stage=&ownerId=me|<id>|unassigned&source=&hasEmail=&hasPhone=&messageable=&cursor=&limit=&sort=`
 * Same vocabulary as `segmentFiltersSchema` plus the legacy tri-state `follower` param. `ownerId=me` is
 * resolved to the caller's id by the route handler (`resolveOwnerFilter`) — segments only ever store real ids.
 */
export const contactListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  channelId: z.string().min(1).max(64).optional(),
  platform: z.nativeEnum(ChannelPlatform).optional(),
  tags: tagListFromQuery,
  tagMode: tagMatchModeSchema.default("all"),
  excludeTags: tagListFromQuery,
  follower: boolFromQuery,
  lastInteractionDays: z.coerce.number().int().min(1).max(SEGMENT_MAX_LAST_INTERACTION_DAYS).optional(),
  excludeOptedOut: boolFromQuery,
  optedOut: boolFromQuery,
  stage: z.string().trim().min(1).max(SEGMENT_MAX_STAGE_LENGTH).optional(),
  ownerId: z.string().min(1).max(64).optional(),
  source: z.nativeEnum(ContactSource).optional(),
  hasEmail: boolFromQuery,
  hasPhone: boolFromQuery,
  messageable: boolFromQuery,
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(CONTACT_LIST_MAX_LIMIT).default(CONTACT_LIST_DEFAULT_LIMIT),
  sort: contactSortSchema.default("recent"),
});

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

/** `ownerId=me` → the viewer's id; the sentinel `unassigned` and real ids pass through. */
export function resolveOwnerFilter(ownerId: string | undefined, viewerId: string): string | undefined {
  if (!ownerId) return undefined;
  return ownerId === "me" ? viewerId : ownerId;
}

/**
 * Segment filters plus the list API's original tri-state `follower` flag
 * (true = followers, false = not following incl. unknown). Everything is
 * folded into `SegmentFilters` by `toSegmentFilters` before hitting Prisma.
 */
export type ContactListFilters = SegmentFilters & {
  follower?: boolean;
};

export type ListContactsOptions = ContactListFilters & {
  cursor?: string;
  limit?: number;
  sort?: ContactSort;
};

/** Canonical filter shape for a list request — the same object a segment would store. */
export function toSegmentFilters(filters: ContactListFilters): SegmentFilters {
  return compactSegmentFilters({
    q: filters.q,
    channelId: filters.channelId,
    platform: filters.platform,
    tags: filters.tags,
    tagMode: filters.tagMode,
    excludeTags: filters.excludeTags,
    onlyFollowers: filters.onlyFollowers || filters.follower === true,
    excludeFollowers: filters.excludeFollowers || filters.follower === false,
    lastInteractionDays: filters.lastInteractionDays,
    excludeOptedOut: filters.excludeOptedOut,
    optedOut: filters.optedOut,
    stage: filters.stage,
    ownerId: filters.ownerId,
    source: filters.source,
    hasEmail: filters.hasEmail,
    hasPhone: filters.hasPhone,
    messageable: filters.messageable,
  });
}

// ───────────────────────── Types ─────────────────────────

export type ContactChannelSummary = {
  id: string;
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
  status: ChannelStatus;
};

/** A workspace member as shown in owner pickers. */
export type ContactOwner = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
};

export type ContactOwnerRef = Pick<ContactOwner, "id" | "name" | "email" | "avatarUrl">;

export type ContactListItem = {
  id: string;
  platform: ChannelPlatform;
  externalId: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  isFollower: boolean | null;
  tags: string[];
  optedOut: boolean;
  firstSeenAt: string;
  lastInteractionAt: string | null;
  channel: Pick<ContactChannelSummary, "id" | "platform" | "username" | "name">;
  conversationId: string | null;
  /** DeliveryLog rows with status SENT and a DM kind (private reply / message / broadcast). */
  dmsReceived: number;
  // ── CRM ──
  stage: string;
  ownerId: string | null;
  owner: ContactOwnerRef | null;
  email: string | null;
  phone: string | null;
  source: ContactSource;
  /** False for CRM-only records (no Meta id) — they cannot be DMed until the person interacts. */
  messageable: boolean;
  lastContactedAt: string | null;
  notesCount: number;
};

export type ContactListResult = { items: ContactListItem[]; nextCursor: string | null };

export type ContactTagCount = { tag: string; count: number };

export type ContactStats = { total: number; newThisWeek: number; followers: number; optedOut: number };

export type ContactConversationSummary = {
  id: string;
  status: ConversationStatus;
  lastInboundAt: Date | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  /** Meta's 24h standard messaging window, measured from the last inbound message. */
  windowOpen: boolean;
  windowClosesAt: Date | null;
};

export type ContactFlowSessionSummary = {
  id: string;
  status: FlowSessionStatus;
  currentNodeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  automation: { id: string; name: string };
};

export type ContactDeliveryLogSummary = Pick<
  DeliveryLog,
  "id" | "kind" | "status" | "messagePreview" | "errorMessage" | "commentExternalId" | "createdAt"
> & {
  automation: { id: string; name: string } | null;
  broadcast: { id: string; name: string } | null;
};

export type ContactLinkClickSummary = {
  id: string;
  createdAt: Date;
  link: { id: string; slug: string; label: string | null; destinationUrl: string };
};

export type ContactMessageSummary = {
  id: string;
  direction: MessageDirection;
  text: string | null;
  createdAt: Date;
  automationId: string | null;
  sentByUserId: string | null;
  sentByName: string | null;
  /** True when an automation or broadcast sent it (mirrors the Inbox "Automated" badge). */
  automated: boolean;
};

export type ContactStageChange = {
  id: string;
  from: string | null;
  to: string;
  createdAt: Date;
  actor: { id: string; name: string | null; email: string } | null;
};

export type ContactTimelineKind = "note" | "message_in" | "message_out" | "dm" | "public_reply" | "automation" | "click" | "stage";
export type ContactTimelineTone = "ok" | "warn" | "error" | "neutral";

/** JSON-safe (ISO dates) — rendered by a client component with filter chips. */
export type ContactTimelineEvent = {
  id: string;
  at: string;
  kind: ContactTimelineKind;
  title: string;
  detail: string | null;
  tone: ContactTimelineTone;
  badge?: { label: string; variant: "secondary" | "success" | "warning" | "destructive" | "outline" };
  href?: string;
  /** Present on `kind: "note"` so the timeline can offer edit/delete in place. */
  note?: ContactNoteSummary;
};

export type ContactDetail = {
  contact: Contact & { channel: ContactChannelSummary; owner: ContactOwnerRef | null };
  conversation: ContactConversationSummary | null;
  flowSessions: ContactFlowSessionSummary[];
  deliveryLogs: ContactDeliveryLogSummary[];
  linkClicks: ContactLinkClickSummary[];
  messages: ContactMessageSummary[];
  notes: ContactNoteSummary[];
  stageChanges: ContactStageChange[];
  segments: { segments: SegmentMatch[]; truncated: boolean };
  timeline: ContactTimelineEvent[];
  stats: { dmsReceived: number; linkClicks: number; flowSessions: number; notes: number };
};

// ───────────────────────── Cursor (keyset) ─────────────────────────

type SortField = "lastInteractionAt" | "firstSeenAt" | "username" | "stage";
type SortSpec = { field: SortField; dir: "asc" | "desc" };

const SORTS: Record<ContactSort, SortSpec> = {
  recent: { field: "lastInteractionAt", dir: "desc" },
  lastInteraction: { field: "lastInteractionAt", dir: "desc" },
  newest: { field: "firstSeenAt", dir: "desc" },
  createdAt: { field: "firstSeenAt", dir: "desc" },
  name: { field: "username", dir: "asc" },
  stage: { field: "stage", dir: "asc" },
};

type DecodedCursor = { v: string | null; id: string };

const cursorPayloadSchema = z.object({ v: z.string().nullable(), id: z.string().min(1) });

function encodeCursor(item: Pick<ContactListItem, "id" | "lastInteractionAt" | "firstSeenAt" | "username" | "stage">, sort: ContactSort): string {
  const v = item[SORTS[sort].field];
  return Buffer.from(JSON.stringify({ v, id: item.id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): DecodedCursor {
  try {
    return cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new ApiError(422, "Invalid cursor", "BAD_CURSOR");
  }
}

/**
 * Keyset predicate: "rows after the cursor row" under the sort's ordering.
 * Nullable keys sort NULLS LAST, so a non-null cursor still admits every
 * null row, and a null cursor only admits later null rows by id.
 */
function cursorWhere(sort: ContactSort, cursor: DecodedCursor): Prisma.ContactWhereInput {
  switch (SORTS[sort].field) {
    case "lastInteractionAt": {
      if (cursor.v === null) return { lastInteractionAt: null, id: { lt: cursor.id } };
      const v = new Date(cursor.v);
      return { OR: [{ lastInteractionAt: { lt: v } }, { lastInteractionAt: v, id: { lt: cursor.id } }, { lastInteractionAt: null }] };
    }
    case "firstSeenAt": {
      const v = new Date(cursor.v ?? 0);
      return { OR: [{ firstSeenAt: { lt: v } }, { firstSeenAt: v, id: { lt: cursor.id } }] };
    }
    case "username": {
      if (cursor.v === null) return { username: null, id: { gt: cursor.id } };
      return { OR: [{ username: { gt: cursor.v } }, { username: cursor.v, id: { gt: cursor.id } }, { username: null }] };
    }
    case "stage": {
      const v = cursor.v ?? "";
      return { OR: [{ stage: { gt: v } }, { stage: v, id: { gt: cursor.id } }] };
    }
  }
}

function orderBy(sort: ContactSort): Prisma.ContactOrderByWithRelationInput[] {
  const { field, dir } = SORTS[sort];
  // `nulls` is only valid on optional columns; firstSeenAt and stage are required.
  if (field === "firstSeenAt" || field === "stage") return [{ [field]: dir }, { id: dir }];
  return [{ [field]: { sort: dir, nulls: "last" } } as Prisma.ContactOrderByWithRelationInput, { id: dir }];
}

// ───────────────────────── Filters ─────────────────────────

/** Single source of truth for filter evaluation is `buildContactWhere` (segments.ts) — never add predicates here. */
function buildWhere(workspaceId: string, filters: ContactListFilters): Prisma.ContactWhereInput {
  return buildContactWhere(workspaceId, toSegmentFilters(filters));
}

const ownerSelect = { id: true, name: true, email: true, avatarUrl: true } satisfies Prisma.UserSelect;

const listSelect = {
  id: true,
  platform: true,
  externalId: true,
  username: true,
  name: true,
  avatarUrl: true,
  isFollower: true,
  tags: true,
  optedOut: true,
  firstSeenAt: true,
  lastInteractionAt: true,
  stage: true,
  ownerId: true,
  owner: { select: ownerSelect },
  email: true,
  phone: true,
  source: true,
  messageable: true,
  lastContactedAt: true,
  notesCount: true,
  channel: { select: { id: true, platform: true, username: true, name: true } },
  conversations: { select: { id: true }, take: 1 },
} satisfies Prisma.ContactSelect;

type ListRow = Prisma.ContactGetPayload<{ select: typeof listSelect }>;

function toListItem(row: ListRow, dmsReceived: number): ContactListItem {
  return {
    id: row.id,
    platform: row.platform,
    externalId: row.externalId,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatarUrl,
    isFollower: row.isFollower,
    tags: row.tags,
    optedOut: row.optedOut,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    channel: row.channel,
    conversationId: row.conversations[0]?.id ?? null,
    dmsReceived,
    stage: row.stage,
    ownerId: row.ownerId,
    owner: row.owner,
    email: row.email,
    phone: row.phone,
    source: row.source,
    messageable: row.messageable,
    lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
    notesCount: row.notesCount,
  };
}

/** SENT DM count per contact for one page of ids (one grouped query instead of N). */
async function dmCounts(workspaceId: string, contactIds: string[]): Promise<Map<string, number>> {
  if (contactIds.length === 0) return new Map();
  const rows = await prisma.deliveryLog.groupBy({
    by: ["contactId"],
    where: { workspaceId, contactId: { in: contactIds }, status: DeliveryStatus.SENT, kind: { in: DM_KINDS } },
    _count: { _all: true },
  });
  return new Map(rows.filter((r) => r.contactId !== null).map((r) => [r.contactId as string, r._count._all]));
}

/** One page of raw rows; `hasMore` comes from fetching limit + 1. */
async function queryPage(where: Prisma.ContactWhereInput, sort: ContactSort, limit: number): Promise<{ rows: ListRow[]; hasMore: boolean }> {
  const rows = await prisma.contact.findMany({ where, select: listSelect, orderBy: orderBy(sort), take: limit + 1 });
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

// ───────────────────────── Queries ─────────────────────────

export async function listContacts(workspaceId: string, options: ListContactsOptions = {}): Promise<ContactListResult> {
  const sort = options.sort ?? "recent";
  const limit = Math.min(Math.max(options.limit ?? CONTACT_LIST_DEFAULT_LIMIT, 1), CONTACT_LIST_MAX_LIMIT);

  const base = buildWhere(workspaceId, options);
  const where: Prisma.ContactWhereInput = options.cursor ? { AND: [base, cursorWhere(sort, decodeCursor(options.cursor))] } : base;

  const { rows, hasMore } = await queryPage(where, sort, limit);
  const counts = await dmCounts(
    workspaceId,
    rows.map((r) => r.id),
  );
  const items = rows.map((row) => toListItem(row, counts.get(row.id) ?? 0));
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last, sort) : null };
}

export async function contactStats(workspaceId: string): Promise<ContactStats> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [total, newThisWeek, followers, optedOut] = await Promise.all([
    prisma.contact.count({ where: { workspaceId } }),
    prisma.contact.count({ where: { workspaceId, firstSeenAt: { gte: weekAgo } } }),
    prisma.contact.count({ where: { workspaceId, isFollower: true } }),
    prisma.contact.count({ where: { workspaceId, optedOut: true } }),
  ]);
  return { total, newThisWeek, followers, optedOut };
}

/**
 * Distinct tags with usage counts. Runs as a single `unnest` aggregate in
 * Postgres — Prisma has no array-aggregate API, and pulling every contact's
 * tag array into Node would not scale past a few tens of thousands of rows.
 */
export async function listTags(workspaceId: string): Promise<ContactTagCount[]> {
  const rows = await prisma.$queryRaw<Array<{ tag: string; count: number }>>(Prisma.sql`
    SELECT t AS "tag", COUNT(*)::int AS "count"
    FROM "Contact", unnest("tags") AS t
    WHERE "workspaceId" = ${workspaceId}
    GROUP BY t
    ORDER BY "count" DESC, t ASC
  `);
  return rows;
}

/**
 * Channels for the filter dropdown. Lives here (not in the channels lane)
 * because the contacts page must not depend on another lane's service; it is
 * intentionally minimal — no tokens, no counts.
 */
export async function listContactChannels(workspaceId: string): Promise<ContactChannelSummary[]> {
  return prisma.channel.findMany({
    where: { workspaceId },
    select: { id: true, platform: true, username: true, name: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Workspace members for owner pickers — owners first, then admins, then members (enum order). */
export async function listOwners(workspaceId: string): Promise<ContactOwner[]> {
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { role: true, user: { select: ownerSelect } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, avatarUrl: m.user.avatarUrl, role: m.role }));
}

/** Throws 422 unless `userId` is a member — owner ids from the client can't be used to probe other workspaces. */
async function requireOwner(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
  if (!member) throw new ApiError(422, "That person isn't a member of this workspace", "NOT_A_MEMBER");
}

const KIND_LABEL: Record<DeliveryKind, string> = {
  PRIVATE_REPLY: "Private reply",
  MESSAGE: "Message",
  PUBLIC_REPLY: "Public comment reply",
  BROADCAST: "Broadcast",
};

function humanizeStatus(status: string): string {
  return status.toLowerCase().replace(/^skipped_/, "skipped — ").replace(/_/g, " ");
}

/**
 * Merges every activity source into one reverse-chronological feed.
 * Outbound sends are represented by their DeliveryLog (every send writes
 * one), so from Message only inbound rows and echoes (sent from the IG/FB
 * app by a human) are taken.
 */
function buildTimeline(input: Pick<ContactDetail, "deliveryLogs" | "flowSessions" | "linkClicks" | "messages" | "notes" | "stageChanges"> & { platform: ChannelPlatform }): ContactTimelineEvent[] {
  const events: ContactTimelineEvent[] = [];

  for (const log of input.deliveryLogs) {
    const via = log.automation ? ` · ${log.automation.name}` : log.broadcast ? ` · ${log.broadcast.name}` : "";
    const sent = log.status === DeliveryStatus.SENT;
    const failed = log.status === DeliveryStatus.FAILED;
    const humanSend = log.kind === DeliveryKind.MESSAGE && !log.automation && !log.broadcast;
    const label = humanSend ? "Inbox message" : KIND_LABEL[log.kind];
    events.push({
      id: `delivery:${log.id}`,
      at: log.createdAt.toISOString(),
      kind: log.kind === DeliveryKind.PUBLIC_REPLY ? "public_reply" : "dm",
      title: `${label} ${sent ? "sent" : failed ? "failed" : humanizeStatus(log.status)}${via}`,
      detail: sent ? log.messagePreview : (log.errorMessage ?? log.messagePreview),
      tone: sent ? "ok" : failed ? "error" : "warn",
      href: log.automation ? `/automations/${log.automation.id}` : log.broadcast ? `/broadcasts/${log.broadcast.id}` : undefined,
    });
  }

  for (const session of input.flowSessions) {
    const badge =
      session.status === "ACTIVE"
        ? { label: "In progress", variant: "secondary" as const }
        : session.status === "COMPLETED"
          ? { label: "Completed", variant: "success" as const }
          : { label: "Expired", variant: "outline" as const };
    events.push({
      id: `session:${session.id}`,
      at: session.createdAt.toISOString(),
      kind: "automation",
      title: `Entered flow “${session.automation.name}”`,
      detail: session.currentNodeId && session.status === "ACTIVE" ? `Waiting at step ${session.currentNodeId}` : null,
      tone: "neutral",
      badge,
      href: `/automations/${session.automation.id}`,
    });
  }

  for (const click of input.linkClicks) {
    events.push({
      id: `click:${click.id}`,
      at: click.createdAt.toISOString(),
      kind: "click",
      title: `Clicked link ${click.link.label ?? `/l/${click.link.slug}`}`,
      detail: click.link.destinationUrl,
      tone: "ok",
      href: "/links",
    });
  }

  const platform = input.platform === ChannelPlatform.INSTAGRAM ? "Instagram" : "Facebook";
  for (const message of input.messages) {
    if (message.direction === "INBOUND") {
      events.push({ id: `msg:${message.id}`, at: message.createdAt.toISOString(), kind: "message_in", title: "Message received", detail: message.text, tone: "neutral" });
    } else if (!message.automated && !message.sentByUserId) {
      events.push({ id: `msg:${message.id}`, at: message.createdAt.toISOString(), kind: "message_out", title: `Sent manually from ${platform}`, detail: message.text, tone: "neutral" });
    }
  }

  for (const note of input.notes) {
    const by = note.author ? (note.author.name?.trim() || note.author.email) : "someone";
    events.push({ id: `note:${note.id}`, at: note.createdAt, kind: "note", title: `Note by ${by}`, detail: note.body, tone: "neutral", note });
  }

  for (const change of input.stageChanges) {
    const by = change.actor ? ` by ${change.actor.name?.trim() || change.actor.email}` : "";
    events.push({
      id: `stage:${change.id}`,
      at: change.createdAt.toISOString(),
      kind: "stage",
      title: change.from ? `Stage changed ${change.from} → ${change.to}${by}` : `Stage set to ${change.to}${by}`,
      detail: null,
      tone: "neutral",
    });
  }

  return events.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1)).slice(0, CONTACT_TIMELINE_MAX);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStageChange(row: { id: string; createdAt: Date; metadata: Prisma.JsonValue | null; user: { id: string; name: string | null; email: string } | null }): ContactStageChange | null {
  const meta = isRecord(row.metadata) ? row.metadata : {};
  if (typeof meta.to !== "string") return null;
  return { id: row.id, from: typeof meta.from === "string" ? meta.from : null, to: meta.to, createdAt: row.createdAt, actor: row.user };
}

export async function getContact(workspaceId: string, id: string): Promise<ContactDetail | null> {
  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId },
    include: {
      channel: { select: { id: true, platform: true, username: true, name: true, status: true } },
      owner: { select: ownerSelect },
    },
  });
  if (!contact) return null;

  const [conversation, flowSessions, deliveryLogs, linkClicks, dmsReceived, linkClickCount, sessionCount, notes, stageRows, segments] = await Promise.all([
    prisma.conversation.findFirst({
      where: { workspaceId, contactId: contact.id },
      select: { id: true, status: true, lastInboundAt: true, lastMessageAt: true, lastMessagePreview: true, unreadCount: true },
    }),
    prisma.flowSession.findMany({
      where: { workspaceId, contactId: contact.id },
      select: { id: true, status: true, currentNodeId: true, createdAt: true, updatedAt: true, automation: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: DETAIL_ACTIVITY_LIMIT,
    }),
    prisma.deliveryLog.findMany({
      where: { workspaceId, contactId: contact.id },
      select: {
        id: true,
        kind: true,
        status: true,
        messagePreview: true,
        errorMessage: true,
        commentExternalId: true,
        createdAt: true,
        automation: { select: { id: true, name: true } },
        broadcast: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: DETAIL_ACTIVITY_LIMIT,
    }),
    // LinkClick has no workspaceId; scope through the link's workspace as well as the contact.
    prisma.linkClick.findMany({
      where: { contactId: contact.id, link: { workspaceId } },
      select: { id: true, createdAt: true, link: { select: { id: true, slug: true, label: true, destinationUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: DETAIL_ACTIVITY_LIMIT,
    }),
    prisma.deliveryLog.count({ where: { workspaceId, contactId: contact.id, status: DeliveryStatus.SENT, kind: { in: DM_KINDS } } }),
    prisma.linkClick.count({ where: { contactId: contact.id, link: { workspaceId } } }),
    prisma.flowSession.count({ where: { workspaceId, contactId: contact.id } }),
    listNotes(workspaceId, contact.id, { limit: DETAIL_NOTES_LIMIT }),
    prisma.auditLog.findMany({
      where: { workspaceId, action: AUDIT_STAGE_CHANGED, targetType: "contact", targetId: contact.id },
      select: { id: true, createdAt: true, metadata: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: DETAIL_STAGE_CHANGES_LIMIT,
    }),
    segmentsForContact(workspaceId, contact.id),
  ]);

  const messages = conversation
    ? await prisma.message.findMany({
        where: { conversationId: conversation.id },
        select: {
          id: true,
          direction: true,
          text: true,
          createdAt: true,
          automationId: true,
          sentByUserId: true,
          payload: true,
          sentBy: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: DETAIL_ACTIVITY_LIMIT,
      })
    : [];

  const messageSummaries: ContactMessageSummary[] = messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    text: m.text,
    createdAt: m.createdAt,
    automationId: m.automationId,
    sentByUserId: m.sentByUserId,
    sentByName: m.sentBy ? (m.sentBy.name?.trim() || m.sentBy.email) : null,
    automated: Boolean(m.automationId) || isAutomatedPayload(m.payload),
  }));
  const stageChanges = stageRows.map(readStageChange).filter((c): c is ContactStageChange => c !== null);

  return {
    contact,
    conversation: conversation
      ? {
          ...conversation,
          windowOpen: isWithinWindow(conversation.lastInboundAt, MESSAGING_WINDOW_MS),
          windowClosesAt: conversation.lastInboundAt ? new Date(conversation.lastInboundAt.getTime() + MESSAGING_WINDOW_MS) : null,
        }
      : null,
    flowSessions,
    deliveryLogs,
    linkClicks,
    messages: messageSummaries,
    notes,
    stageChanges,
    segments,
    timeline: buildTimeline({ deliveryLogs, flowSessions, linkClicks, messages: messageSummaries, notes, stageChanges, platform: contact.platform }),
    stats: { dmsReceived, linkClicks: linkClickCount, flowSessions: sessionCount, notes: contact.notesCount },
  };
}

/** `lib/automation/send.ts` stamps `payload.meta.automated` on outbound sends. */
function isAutomatedPayload(payload: Prisma.JsonValue | null): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const meta = (payload as Record<string, unknown>).meta;
  return Boolean(meta && typeof meta === "object" && (meta as Record<string, unknown>).automated === true);
}

// ───────────────────────── Mutations ─────────────────────────

async function requireContact(workspaceId: string, id: string): Promise<Contact> {
  const contact = await prisma.contact.findFirst({ where: { id, workspaceId } });
  if (!contact) throw new ApiError(404, "Contact not found", "NOT_FOUND");
  return contact;
}

/** Raw text → stored value: "" clears, otherwise it must normalise or the request is a 422. */
function emailForUpdate(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  const email = normalizeEmail(raw);
  if (!email) throw new ApiError(422, "Enter a valid email address", "INVALID_EMAIL");
  return email;
}

function phoneForUpdate(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  const phone = normalizePhone(raw);
  if (!phone) throw new ApiError(422, "Enter a phone number with 7–15 digits (an optional leading + is fine)", "INVALID_PHONE");
  return phone;
}

function stageChangeAudit(workspaceId: string, actorId: string | null | undefined, contactId: string, from: string, to: string): Prisma.AuditLogCreateManyInput {
  return { workspaceId, userId: actorId ?? null, action: AUDIT_STAGE_CHANGED, targetType: "contact", targetId: contactId, metadata: { from, to } };
}

/**
 * Partial update. Stage is validated against the workspace pipeline and the
 * owner against the member list so client-supplied ids can't smuggle values
 * across workspaces. A stage change also writes the audit row the timeline
 * shows as "Stage changed A → B".
 */
export async function updateContact(workspaceId: string, id: string, input: UpdateContactInput, actorId?: string | null): Promise<Contact> {
  const data = updateContactSchema.parse(input);
  const existing = await requireContact(workspaceId, id);

  const update: Prisma.ContactUncheckedUpdateInput = {};
  if (data.tags !== undefined) update.tags = { set: data.tags };
  if (data.customFields !== undefined) update.customFields = data.customFields as Prisma.InputJsonObject;
  if (data.optedOut !== undefined) update.optedOut = data.optedOut;
  if (data.name !== undefined) update.name = data.name === "" ? null : data.name;
  if (data.email !== undefined) update.email = emailForUpdate(data.email);
  if (data.phone !== undefined) update.phone = phoneForUpdate(data.phone);
  if (data.ownerId !== undefined) {
    if (data.ownerId !== null) await requireOwner(workspaceId, data.ownerId);
    update.ownerId = data.ownerId;
  }
  let stageChanged: string | null = null;
  if (data.stage !== undefined) {
    const stage = await requireStage(workspaceId, data.stage);
    if (stage !== existing.stage) {
      update.stage = stage;
      stageChanged = stage;
    }
  }

  const contact = await prisma.contact.update({ where: { id }, data: update });
  if (stageChanged) {
    await prisma.auditLog.create({ data: stageChangeAudit(workspaceId, actorId, id, existing.stage, stageChanged) });
  }
  logger.info("contact.updated", { workspaceId, contactId: id, fields: Object.keys(data) });
  return contact;
}

/** Bulk stage move. One audit row per contact that actually changed so each profile's timeline stays accurate. */
export async function setStage(workspaceId: string, ids: string[], stage: string, actorId?: string | null): Promise<{ updated: number }> {
  const scoped = ids.slice(0, CONTACT_BULK_MAX_IDS);
  if (scoped.length === 0) return { updated: 0 };
  const clean = await requireStage(workspaceId, stage);

  const targets = await prisma.contact.findMany({ where: { workspaceId, id: { in: scoped }, stage: { not: clean } }, select: { id: true, stage: true } });
  if (targets.length === 0) return { updated: 0 };

  const [res] = await prisma.$transaction([
    prisma.contact.updateMany({ where: { workspaceId, id: { in: targets.map((t) => t.id) } }, data: { stage: clean } }),
    prisma.auditLog.createMany({ data: targets.map((t) => stageChangeAudit(workspaceId, actorId, t.id, t.stage, clean)) }),
  ]);
  logger.info("contact.bulk_stage", { workspaceId, stage: clean, count: res.count });
  return { updated: res.count };
}

/** Bulk assign (or unassign with null). */
export async function setOwner(workspaceId: string, ids: string[], ownerId: string | null): Promise<{ updated: number }> {
  const scoped = ids.slice(0, CONTACT_BULK_MAX_IDS);
  if (scoped.length === 0) return { updated: 0 };
  if (ownerId) await requireOwner(workspaceId, ownerId);
  const res = await prisma.contact.updateMany({ where: { workspaceId, id: { in: scoped } }, data: { ownerId } });
  logger.info("contact.bulk_owner", { workspaceId, ownerId, count: res.count });
  return { updated: res.count };
}

/**
 * Bulk tag add/remove in one statement each. Array math happens in Postgres
 * so the update is atomic per row and never races with the flow engine's own
 * add_tag / remove_tag writes. Order of existing tags is preserved; new tags
 * are appended only when absent.
 */
export async function addTags(workspaceId: string, ids: string[], tags: string[]): Promise<{ updated: number }> {
  const clean = normalizeTags(tags);
  const scoped = ids.slice(0, CONTACT_BULK_MAX_IDS);
  if (clean.length === 0 || scoped.length === 0) return { updated: 0 };

  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Contact"
    SET "tags" = "tags" || ARRAY(SELECT t FROM unnest(${clean}::text[]) AS t WHERE NOT (t = ANY("tags"))),
        "updatedAt" = NOW()
    WHERE "workspaceId" = ${workspaceId}
      AND "id" = ANY(${scoped}::text[])
      AND NOT ("tags" @> ${clean}::text[])
  `);
  logger.info("contact.tags_added", { workspaceId, count: updated, tags: clean });
  return { updated };
}

export async function removeTags(workspaceId: string, ids: string[], tags: string[]): Promise<{ updated: number }> {
  const clean = normalizeTags(tags);
  const scoped = ids.slice(0, CONTACT_BULK_MAX_IDS);
  if (clean.length === 0 || scoped.length === 0) return { updated: 0 };

  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Contact"
    SET "tags" = ARRAY(SELECT t FROM unnest("tags") AS t WHERE NOT (t = ANY(${clean}::text[]))),
        "updatedAt" = NOW()
    WHERE "workspaceId" = ${workspaceId}
      AND "id" = ANY(${scoped}::text[])
      AND "tags" && ${clean}::text[]
  `);
  logger.info("contact.tags_removed", { workspaceId, count: updated, tags: clean });
  return { updated };
}

/** Rename a tag everywhere in the workspace; contacts already carrying the new name end up with one copy. */
export async function renameTag(workspaceId: string, from: string, to: string): Promise<{ updated: number }> {
  const { from: cleanFrom, to: cleanTo } = renameTagSchema.parse({ from, to });
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Contact"
    SET "tags" = ARRAY(
          SELECT t FROM unnest(array_replace("tags", ${cleanFrom}, ${cleanTo})) WITH ORDINALITY AS u(t, ord)
          GROUP BY t ORDER BY MIN(ord)
        ),
        "updatedAt" = NOW()
    WHERE "workspaceId" = ${workspaceId}
      AND ${cleanFrom} = ANY("tags")
  `);
  logger.info("contact.tag_renamed", { workspaceId, from: cleanFrom, to: cleanTo, count: updated });
  return { updated };
}

/** Strip a tag from every contact in the workspace (the tag itself has no row to delete). */
export async function deleteTag(workspaceId: string, tag: string): Promise<{ updated: number }> {
  const clean = tagSchema.parse(tag);
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Contact"
    SET "tags" = array_remove("tags", ${clean}),
        "updatedAt" = NOW()
    WHERE "workspaceId" = ${workspaceId}
      AND ${clean} = ANY("tags")
  `);
  logger.info("contact.tag_deleted", { workspaceId, tag: clean, count: updated });
  return { updated };
}

/** Removes the contact; conversations, messages and flow sessions cascade, delivery logs keep a null contactId. */
export async function deleteContact(workspaceId: string, id: string): Promise<void> {
  const { count } = await prisma.contact.deleteMany({ where: { id, workspaceId } });
  if (count === 0) throw new ApiError(404, "Contact not found", "NOT_FOUND");
  logger.info("contact.deleted", { workspaceId, contactId: id });
}

export async function deleteContacts(workspaceId: string, ids: string[]): Promise<{ deleted: number }> {
  const scoped = ids.slice(0, CONTACT_BULK_MAX_IDS);
  if (scoped.length === 0) return { deleted: 0 };
  const { count } = await prisma.contact.deleteMany({ where: { workspaceId, id: { in: scoped } } });
  logger.info("contact.bulk_deleted", { workspaceId, requested: scoped.length, deleted: count });
  return { deleted: count };
}

// ───────────────────────── Manual (CRM-only) contacts ─────────────────────────

/**
 * A record added by hand. It has no Meta id, so it is stored under a
 * synthetic `manual:<id>` external id with `messageable: false`; the moment
 * the person comments or messages, `adoptManualContact` folds it into the
 * real webhook contact. Username (per channel) and email (per workspace)
 * must be unique so the same person can't be added twice.
 */
export async function createManualContact(workspaceId: string, input: CreateManualContactInput, actorId?: string | null): Promise<Contact> {
  const data = createManualContactSchema.parse(input);
  const channel = await prisma.channel.findFirst({ where: { id: data.channelId, workspaceId }, select: { id: true, platform: true } });
  if (!channel) throw new ApiError(404, "Channel not found", "NOT_FOUND");

  const username = normalizeUsername(data.username);
  const email = data.email ? emailForUpdate(data.email) : null;
  const phone = data.phone ? phoneForUpdate(data.phone) : null;
  const stage = data.stage ? await requireStage(workspaceId, data.stage) : (await getStages(workspaceId))[0] ?? "New";

  if (username) {
    const clash = await prisma.contact.findFirst({
      where: { workspaceId, channelId: channel.id, username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) throw new ApiError(409, `@${username} is already a contact on this channel`, "DUPLICATE_USERNAME");
  }
  if (email) {
    const clash = await prisma.contact.findFirst({ where: { workspaceId, email }, select: { id: true } });
    if (clash) throw new ApiError(409, `A contact with ${email} already exists`, "DUPLICATE_EMAIL");
  }

  // The external id must be unique per channel and stable; the row's own cuid is both, so it is stamped in a second step.
  const contact = await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: {
        workspaceId,
        channelId: channel.id,
        platform: channel.platform,
        externalId: `manual:pending:${randomUUID()}`,
        username,
        name: data.name,
        email,
        phone,
        stage,
        tags: data.tags ?? [],
        source: ContactSource.MANUAL,
        messageable: false,
      },
    });
    return tx.contact.update({ where: { id: created.id }, data: { externalId: `manual:${created.id}` } });
  });

  await recordAudit({ workspaceId, userId: actorId, action: "contact.create", targetType: "contact", targetId: contact.id, metadata: { source: "MANUAL" } });
  logger.info("contact.manual_created", { workspaceId, contactId: contact.id });
  return contact;
}

function unionTags(a: string[], b: string[]): string[] {
  return normalizeTags([...a, ...b]);
}

/**
 * Merge rule for a CRM-only record meeting its real self. When a WEBHOOK
 * contact appears on `channelId` under a username that a MANUAL/IMPORT
 * contact already carries, the CRM fields move onto the webhook contact and
 * the placeholder is deleted:
 * - email / phone / name / owner: webhook value if present, else the CRM value;
 * - stage: the CRM record's stage (the webhook row was just created at the default);
 * - tags: union (webhook order first); customFields: CRM as base, webhook keys win;
 * - notes are re-pointed and `notesCount` summed; `lastContactedAt` keeps the later date.
 * Never throws — a failed merge must not break webhook processing. Returns
 * the merged contact, or null when there was nothing to adopt.
 */
export async function adoptManualContact(channelId: string, username: string, webhookContactId: string): Promise<Contact | null> {
  const handle = normalizeUsername(username);
  if (!handle) return null;
  try {
    const twin = await prisma.contact.findFirst({
      where: {
        channelId,
        id: { not: webhookContactId },
        source: { in: [ContactSource.MANUAL, ContactSource.IMPORT] },
        username: { equals: handle, mode: "insensitive" },
      },
    });
    if (!twin) return null;

    const merged = await prisma.$transaction(async (tx) => {
      const target = await tx.contact.findUnique({ where: { id: webhookContactId } });
      if (!target || target.workspaceId !== twin.workspaceId || target.channelId !== channelId || !target.messageable) return null;

      const twinFields = isRecord(twin.customFields) ? twin.customFields : {};
      const targetFields = isRecord(target.customFields) ? target.customFields : {};
      const later = [target.lastContactedAt, twin.lastContactedAt].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      await tx.contactNote.updateMany({ where: { contactId: twin.id, workspaceId: twin.workspaceId }, data: { contactId: target.id } });
      const updated = await tx.contact.update({
        where: { id: target.id },
        data: {
          email: target.email ?? twin.email,
          phone: target.phone ?? twin.phone,
          name: target.name ?? twin.name,
          ownerId: target.ownerId ?? twin.ownerId,
          stage: twin.stage,
          tags: { set: unionTags(target.tags, twin.tags) },
          customFields: { ...twinFields, ...targetFields } as Prisma.InputJsonObject,
          lastContactedAt: later,
          notesCount: target.notesCount + twin.notesCount,
        },
      });
      await tx.contact.delete({ where: { id: twin.id } });
      return updated;
    });
    if (!merged) return null;

    await recordAudit({
      workspaceId: merged.workspaceId,
      action: "contact.merged",
      targetType: "contact",
      targetId: merged.id,
      metadata: { from: twin.id, username: handle, source: twin.source },
    });
    logger.info("contact.adopted", { workspaceId: merged.workspaceId, contactId: merged.id, from: twin.id });
    return merged;
  } catch (err) {
    logger.error("contact.adopt_failed", { channelId, username: handle, webhookContactId, error: err });
    return null;
  }
}

// ───────────────────────── Export ─────────────────────────

/**
 * Spreadsheet formula injection: a cell beginning with = + - @ (or a tab/CR)
 * is executed by Excel/Sheets when opened. Prefixing with an apostrophe is
 * the OWASP-recommended neutralisation and is invisible in most viewers.
 */
function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const EXPORT_HEADERS = [
  "username",
  "name",
  "email",
  "phone",
  "stage",
  "owner",
  "platform",
  "channel",
  "source",
  "tags",
  "follower",
  "first_seen",
  "last_interaction",
  "last_contacted",
  "opted_out",
];

/**
 * Same filters as the list, streamed page by page into one string. Capped at
 * CONTACT_EXPORT_MAX_ROWS; larger workspaces should narrow the filters.
 */
export async function exportContactsCsv(workspaceId: string, filters: ContactListFilters = {}): Promise<string> {
  const where = buildWhere(workspaceId, filters);
  const lines: string[] = [EXPORT_HEADERS.join(",")];
  let cursor: DecodedCursor | null = null;
  let rowsSeen = 0;

  while (rowsSeen < CONTACT_EXPORT_MAX_ROWS) {
    const pageWhere: Prisma.ContactWhereInput = cursor ? { AND: [where, cursorWhere("newest", cursor)] } : where;
    const { rows, hasMore } = await queryPage(pageWhere, "newest", Math.min(EXPORT_PAGE_SIZE, CONTACT_EXPORT_MAX_ROWS - rowsSeen));
    for (const row of rows) {
      lines.push(
        [
          row.username,
          row.name,
          row.email,
          row.phone,
          row.stage,
          row.owner ? (row.owner.name?.trim() || row.owner.email) : "",
          row.platform === ChannelPlatform.INSTAGRAM ? "instagram" : "facebook",
          row.channel.username ?? row.channel.name ?? "",
          row.source.toLowerCase(),
          row.tags.join("; "),
          row.isFollower === null ? "" : row.isFollower ? "yes" : "no",
          row.firstSeenAt.toISOString(),
          row.lastInteractionAt?.toISOString() ?? "",
          row.lastContactedAt?.toISOString() ?? "",
          row.optedOut ? "yes" : "no",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    rowsSeen += rows.length;
    const last = rows[rows.length - 1];
    if (!hasMore || !last) break;
    cursor = { v: last.firstSeenAt.toISOString(), id: last.id };
  }

  if (rowsSeen >= CONTACT_EXPORT_MAX_ROWS) logger.warn("contact.export_truncated", { workspaceId, rows: rowsSeen });
  return lines.join("\r\n") + "\r\n";
}

export { SEGMENT_OWNER_UNASSIGNED };
