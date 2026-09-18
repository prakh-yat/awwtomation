/**
 * Inbox service: the unified live chat over Instagram DMs and Messenger.
 *
 * Every function takes `workspaceId` first and scopes every query by it;
 * conversation ids coming from the client are never trusted on their own.
 * Functions return plain JSON-safe DTOs (ISO date strings) so the same
 * shapes flow through both server-component props and `app/api/inbox/*`.
 */
import {
  ChannelStatus,
  ConversationStatus,
  DeliveryKind,
  DeliveryStatus,
  MessageDirection,
  type ChannelPlatform,
  type FlowSessionStatus,
  type Prisma,
} from "@prisma/client";

import { recordMessage } from "@/lib/automation/engine";
import {
  HUMAN_AGENT_WINDOW_MS,
  MESSAGING_WINDOW_MS,
  isWithinWindow,
  sendToContact,
  type SendToContactResult,
} from "@/lib/automation/send";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getFacebookConversationMessages, listFacebookConversations } from "@/lib/meta/facebook";
import { getInstagramConversationMessages, listInstagramConversations } from "@/lib/meta/instagram";
import { MAX_BUTTONS, MAX_TEXT_BYTES, utf8Bytes } from "@/lib/meta/messages";
import { getChannelToken, markChannelTokenExpired } from "@/lib/meta/tokens";
import {
  MetaApiError,
  MetaTokenError,
  type ConversationMessage,
  type OutboundButton,
  type OutboundMessage,
} from "@/lib/meta/types";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── DTOs ─────────────────────────

export type WindowKind = "standard" | "human_agent" | "closed";

/**
 * Meta's messaging window for a conversation.
 * - `standard`: within 24h of the contact's last message, anyone (bots included) may send.
 * - `human_agent`: 24h have passed but it's < 7 days, only a person may reply, using the HUMAN_AGENT tag.
 * - `closed`: nothing can be sent until the contact messages again.
 * `open` is true for both `standard` and `human_agent`.
 */
export type WindowState = { open: boolean; kind: WindowKind; expiresAt: string | null };

export type InboxUser = { id: string; name: string | null; email: string; avatarUrl: string | null };

export type InboxChannel = {
  id: string;
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  status: ChannelStatus;
};

export type InboxContact = {
  id: string;
  externalId: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  isFollower: boolean | null;
  tags: string[];
  optedOut: boolean;
  customFields: Record<string, unknown>;
  firstSeenAt: string;
  lastInteractionAt: string | null;
};

export type MessageAttachment = { kind: "image" | "video" | "audio" | "file" | "unknown"; url: string | null; name: string | null };

export type InboxMessage = {
  id: string;
  direction: MessageDirection;
  externalId: string | null;
  text: string | null;
  createdAt: string;
  automationId: string | null;
  /** Sent by an automation or broadcast (drives the "Automated" badge). */
  automated: boolean;
  tag: "HUMAN_AGENT" | null;
  /** Outbound message that originated in the IG/FB app rather than from us (webhook echo). */
  isEcho: boolean;
  sentBy: InboxUser | null;
  buttons: OutboundButton[];
  imageUrl: string | null;
  attachments: MessageAttachment[];
  storyReply: { storyId: string | null; url: string | null } | null;
};

export type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastInboundAt: string | null;
  externalId: string | null;
  createdAt: string;
  assignedTo: InboxUser | null;
  contact: InboxContact;
  channel: InboxChannel;
  lastMessage: Pick<InboxMessage, "id" | "direction" | "text" | "createdAt" | "automated"> | null;
  window: WindowState;
};

export type FlowSessionSummary = {
  id: string;
  status: FlowSessionStatus;
  currentNodeId: string | null;
  createdAt: string;
  updatedAt: string;
  automation: { id: string; name: string };
};

export type ConversationDetail = ConversationListItem & {
  messages: InboxMessage[];
  hasMoreMessages: boolean;
  recentSessions: FlowSessionSummary[];
};

export type ConversationPage = { items: ConversationListItem[]; nextCursor: string | null };
export type MessagePage = { messages: InboxMessage[]; hasMore: boolean };
export type InboxCounts = { open: number; unread: number; mine: number };
export type SyncResult = { found: boolean; imported: number; total: number };

export type InboxAssignedFilter = "me" | "unassigned" | "all";

export type ListConversationsOptions = {
  channelId?: string;
  status?: ConversationStatus;
  assigned?: InboxAssignedFilter;
  /** Only conversations with unread inbound messages. */
  unread?: boolean;
  /** Matches contact username/name or the last message preview. */
  q?: string;
  /** Conversation id of the last item of the previous page. */
  cursor?: string;
  limit?: number;
  /** Required when `assigned === "me"`. */
  viewerId?: string;
};

export const DEFAULT_LIST_LIMIT = 30;
export const MAX_LIST_LIMIT = 100;
export const DEFAULT_MESSAGE_LIMIT = 50;
export const MAX_MESSAGE_LIMIT = 200;
export const RECENT_SESSIONS_LIMIT = 5;

// ───────────────────────── Window ─────────────────────────

export function windowState(conversation: { lastInboundAt: Date | null }, now = Date.now()): WindowState {
  const last = conversation.lastInboundAt;
  if (last && isWithinWindow(last, MESSAGING_WINDOW_MS, now)) {
    return { open: true, kind: "standard", expiresAt: new Date(last.getTime() + MESSAGING_WINDOW_MS).toISOString() };
  }
  if (last && isWithinWindow(last, HUMAN_AGENT_WINDOW_MS, now)) {
    return { open: true, kind: "human_agent", expiresAt: new Date(last.getTime() + HUMAN_AGENT_WINDOW_MS).toISOString() };
  }
  return { open: false, kind: "closed", expiresAt: null };
}

// ───────────────────────── Selects & mappers ─────────────────────────

const userSelect = { id: true, name: true, email: true, avatarUrl: true } satisfies Prisma.UserSelect;

const channelSelect = {
  id: true,
  platform: true,
  username: true,
  name: true,
  avatarUrl: true,
  status: true,
} satisfies Prisma.ChannelSelect;

const contactSelect = {
  id: true,
  externalId: true,
  username: true,
  name: true,
  avatarUrl: true,
  isFollower: true,
  tags: true,
  optedOut: true,
  customFields: true,
  firstSeenAt: true,
  lastInteractionAt: true,
} satisfies Prisma.ContactSelect;

const messageSelect = {
  id: true,
  direction: true,
  externalId: true,
  text: true,
  payload: true,
  automationId: true,
  createdAt: true,
  sentBy: { select: userSelect },
} satisfies Prisma.MessageSelect;

const conversationSelect = {
  id: true,
  status: true,
  unreadCount: true,
  lastMessageAt: true,
  lastMessagePreview: true,
  lastInboundAt: true,
  externalId: true,
  createdAt: true,
  assignedTo: { select: userSelect },
  contact: { select: contactSelect },
  channel: { select: channelSelect },
  // The newest message rides along so the list can show "You:" prefixes and the Automated marker.
  messages: { orderBy: { createdAt: "desc" as const }, take: 1, select: messageSelect },
} satisfies Prisma.ConversationSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type ContactRow = Prisma.ContactGetPayload<{ select: typeof contactSelect }>;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isOutboundButton(value: unknown): value is OutboundButton {
  if (!isRecord(value) || typeof value.title !== "string") return false;
  if (value.type === "web_url") return typeof value.url === "string";
  if (value.type === "postback") return typeof value.payload === "string";
  return false;
}

/**
 * Attachments reach us in two shapes: webhook (`{ type, payload: { url } }`)
 * and Graph conversation reads (`{ mime_type, image_data, video_data, file_url }`).
 * Flatten both into something the bubble can render without guessing.
 */
function normalizeAttachment(raw: unknown): MessageAttachment {
  if (!isRecord(raw)) return { kind: "unknown", url: null, name: null };
  const payload = isRecord(raw.payload) ? raw.payload : null;
  const imageData = isRecord(raw.image_data) ? raw.image_data : null;
  const videoData = isRecord(raw.video_data) ? raw.video_data : null;
  const type = str(raw.type);
  const mime = str(raw.mime_type);
  const url =
    str(payload?.url) ??
    str(imageData?.url) ??
    str(imageData?.preview_url) ??
    str(videoData?.url) ??
    str(raw.file_url) ??
    str(raw.url);

  let kind: MessageAttachment["kind"] = "unknown";
  if (type === "image" || imageData || mime?.startsWith("image/")) kind = "image";
  else if (type === "video" || videoData || mime?.startsWith("video/")) kind = "video";
  else if (type === "audio" || mime?.startsWith("audio/")) kind = "audio";
  else if (type === "file" || raw.file_url || mime) kind = "file";

  return { kind, url, name: str(raw.name) ?? type };
}

function toUser(row: UserRow): InboxUser {
  return { id: row.id, name: row.name, email: row.email, avatarUrl: row.avatarUrl };
}

function toContact(row: ContactRow): InboxContact {
  return {
    id: row.id,
    externalId: row.externalId,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatarUrl,
    isFollower: row.isFollower,
    tags: row.tags,
    optedOut: row.optedOut,
    customFields: isRecord(row.customFields) ? row.customFields : {},
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
  };
}

function toMessage(row: MessageRow): InboxMessage {
  const payload = isRecord(row.payload) ? row.payload : {};
  const meta = isRecord(payload.meta) ? payload.meta : {};
  const story = isRecord(payload.storyReply) ? payload.storyReply : null;
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const buttons = Array.isArray(payload.buttons) ? payload.buttons.filter(isOutboundButton) : [];

  return {
    id: row.id,
    direction: row.direction,
    externalId: row.externalId,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    automationId: row.automationId,
    automated: Boolean(row.automationId) || meta.automated === true,
    tag: meta.tag === "HUMAN_AGENT" ? "HUMAN_AGENT" : null,
    isEcho: payload.echo === true,
    sentBy: row.sentBy ? toUser(row.sentBy) : null,
    buttons,
    imageUrl: str(payload.imageUrl),
    attachments: attachments.map(normalizeAttachment),
    storyReply: story ? { storyId: str(story.storyId), url: str(story.url) } : null,
  };
}

function toListItem(row: ConversationRow, now = Date.now()): ConversationListItem {
  const last = row.messages[0] ? toMessage(row.messages[0]) : null;
  return {
    id: row.id,
    status: row.status,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: row.lastMessagePreview,
    lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
    externalId: row.externalId,
    createdAt: row.createdAt.toISOString(),
    assignedTo: row.assignedTo ? toUser(row.assignedTo) : null,
    contact: toContact(row.contact),
    channel: row.channel,
    lastMessage: last
      ? { id: last.id, direction: last.direction, text: last.text, createdAt: last.createdAt, automated: last.automated }
      : null,
    window: windowState(row, now),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// ───────────────────────── Channels (inbox needs) ─────────────────────────

/**
 * Minimal channel list for the inbox filter and the "no channels" empty
 * state. Lives here because `lib/services/channels.ts` belongs to another lane.
 */
export async function listInboxChannels(workspaceId: string): Promise<InboxChannel[]> {
  return prisma.channel.findMany({ where: { workspaceId }, select: channelSelect, orderBy: { createdAt: "asc" } });
}

// ───────────────────────── Reads ─────────────────────────

export async function listConversations(workspaceId: string, opts: ListConversationsOptions = {}): Promise<ConversationPage> {
  const limit = clamp(opts.limit ?? DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
  const where: Prisma.ConversationWhereInput = { workspaceId };

  if (opts.channelId) where.channelId = opts.channelId;
  if (opts.status) where.status = opts.status;
  if (opts.unread) where.unreadCount = { gt: 0 };
  if (opts.assigned === "me") {
    if (!opts.viewerId) throw new ApiError(400, "viewerId is required for the 'me' filter", "BAD_REQUEST");
    where.assignedToId = opts.viewerId;
  } else if (opts.assigned === "unassigned") {
    where.assignedToId = null;
  }

  const q = opts.q?.trim();
  if (q) {
    where.OR = [
      { contact: { username: { contains: q.replace(/^@/, ""), mode: "insensitive" } } },
      { contact: { name: { contains: q, mode: "insensitive" } } },
      { lastMessagePreview: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.conversation.findMany({
    where,
    select: conversationSelect,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const now = Date.now();
  return { items: page.map((row) => toListItem(row, now)), nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

/** Newest-last page of messages. `before` is the id of the oldest message already loaded. */
export async function listMessages(
  workspaceId: string,
  conversationId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<MessagePage> {
  const limit = clamp(opts.limit ?? DEFAULT_MESSAGE_LIMIT, 1, MAX_MESSAGE_LIMIT);
  const rows = await prisma.message.findMany({
    where: { conversationId, conversation: { workspaceId } },
    select: messageSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  return { messages: page.map(toMessage), hasMore };
}

/** Full thread view. Returns null (rather than throwing) so pages can render a "not found" state. */
export async function getConversation(
  workspaceId: string,
  conversationId: string,
  opts: { messageLimit?: number } = {},
): Promise<ConversationDetail | null> {
  const row = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId }, select: conversationSelect });
  if (!row) return null;

  const [page, sessions] = await Promise.all([
    listMessages(workspaceId, conversationId, { limit: opts.messageLimit }),
    prisma.flowSession.findMany({
      where: { workspaceId, contactId: row.contact.id },
      orderBy: { updatedAt: "desc" },
      take: RECENT_SESSIONS_LIMIT,
      select: {
        id: true,
        status: true,
        currentNodeId: true,
        createdAt: true,
        updatedAt: true,
        automation: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    ...toListItem(row),
    messages: page.messages,
    hasMoreMessages: page.hasMore,
    recentSessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      currentNodeId: s.currentNodeId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      automation: s.automation,
    })),
  };
}

export async function getInboxCounts(workspaceId: string, viewerId: string): Promise<InboxCounts> {
  const open = { workspaceId, status: ConversationStatus.OPEN } as const;
  const [openCount, unread, mine] = await Promise.all([
    prisma.conversation.count({ where: open }),
    prisma.conversation.count({ where: { ...open, unreadCount: { gt: 0 } } }),
    prisma.conversation.count({ where: { ...open, assignedToId: viewerId } }),
  ]);
  return { open: openCount, unread, mine };
}

// ───────────────────────── Mutations ─────────────────────────

function notFound(): ApiError {
  return new ApiError(404, "Conversation not found", "NOT_FOUND");
}

export async function markRead(workspaceId: string, conversationId: string): Promise<void> {
  const res = await prisma.conversation.updateMany({ where: { id: conversationId, workspaceId }, data: { unreadCount: 0 } });
  if (res.count === 0) throw notFound();
}

export async function setStatus(workspaceId: string, conversationId: string, status: ConversationStatus): Promise<void> {
  const res = await prisma.conversation.updateMany({ where: { id: conversationId, workspaceId }, data: { status } });
  if (res.count === 0) throw notFound();
  logger.info("inbox.status_changed", { workspaceId, conversationId, status });
}

/** Assign to someone in the workspace's organization, or `null` to unassign. Non-members are rejected so ids can't be probed. */
export async function assign(workspaceId: string, conversationId: string, userId: string | null): Promise<void> {
  if (userId) {
    const member = await prisma.organizationMember.findFirst({
      where: { userId, organization: { workspaces: { some: { id: workspaceId } } } },
      select: { id: true },
    });
    if (!member) throw new ApiError(422, "That person isn't a member of this workspace", "NOT_A_MEMBER");
  }
  const res = await prisma.conversation.updateMany({ where: { id: conversationId, workspaceId }, data: { assignedToId: userId } });
  if (res.count === 0) throw notFound();
}

function hasContent(message: OutboundMessage): boolean {
  return Boolean(message.text?.trim() || message.imageUrl || message.buttons?.length || message.quickReplies?.length);
}

function describeClosedWindow(lastInboundAt: Date | null): string {
  if (!lastInboundAt) return "You can reply once this person messages you.";
  const days = Math.floor((Date.now() - lastInboundAt.getTime()) / (24 * 3600 * 1000));
  return `Their last message was ${days} day${days === 1 ? "" : "s"} ago, so the window to reply has closed.`;
}

/** Translate a non-SENT `sendToContact` outcome into the HTTP error the composer should show. */
function sendFailure(result: SendToContactResult): ApiError {
  switch (result.status) {
    case DeliveryStatus.SKIPPED_WINDOW:
      return new ApiError(409, "Outside the 24-hour messaging window", "WINDOW_CLOSED");
    case DeliveryStatus.SKIPPED_RATE_LIMIT:
      return new ApiError(429, "You're sending too quickly. Try again in a moment.", "RATE_LIMITED");
    case DeliveryStatus.SKIPPED_PLAN_LIMIT:
      return new ApiError(402, result.error ?? "Monthly DM limit reached", "PLAN_LIMIT");
    case DeliveryStatus.SKIPPED_OPTED_OUT:
      return new ApiError(409, "This contact has opted out of messages", "OPTED_OUT");
    case DeliveryStatus.SKIPPED_SELF:
      return new ApiError(409, "You can't message the connected account itself", "SELF_MESSAGE");
    default:
      return new ApiError(502, result.error ?? "Meta didn't accept the message", "SEND_FAILED");
  }
}

/**
 * Human reply from the inbox. Goes through `sendToContact` like every other
 * send (quota, rate limit, window, bookkeeping). A closed conversation is
 * reopened: replying is the clearest signal that it's active again.
 */
export async function sendReply(
  workspaceId: string,
  conversationId: string,
  senderUserId: string,
  message: OutboundMessage,
  opts: { humanAgent?: boolean } = {},
): Promise<InboxMessage> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: { channel: true, contact: true },
  });
  if (!conversation) throw notFound();

  if (!hasContent(message)) throw new ApiError(422, "Write a message before sending", "EMPTY_MESSAGE");
  if (message.text && utf8Bytes(message.text) > MAX_TEXT_BYTES) {
    throw new ApiError(422, `Messages are limited to ${MAX_TEXT_BYTES} bytes by Meta`, "TEXT_TOO_LONG");
  }
  if ((message.buttons?.length ?? 0) > MAX_BUTTONS) {
    throw new ApiError(422, `Meta allows at most ${MAX_BUTTONS} buttons per message`, "TOO_MANY_BUTTONS");
  }

  const window = windowState(conversation);
  if (window.kind === "closed") throw new ApiError(409, describeClosedWindow(conversation.lastInboundAt), "WINDOW_CLOSED");
  if (window.kind === "human_agent" && !opts.humanAgent) {
    throw new ApiError(
      409,
      "The 24-hour window has closed. Send as a human agent to reply within 7 days of their last message.",
      "WINDOW_CLOSED",
    );
  }
  if (conversation.channel.status !== ChannelStatus.ACTIVE) {
    throw new ApiError(409, "This account is disconnected. Reconnect it on the Channels page.", "CHANNEL_INACTIVE");
  }

  let result: SendToContactResult;
  try {
    result = await sendToContact({
      channel: conversation.channel,
      contact: conversation.contact,
      message,
      sentByUserId: senderUserId,
      tag: opts.humanAgent ? "HUMAN_AGENT" : undefined,
      kind: DeliveryKind.MESSAGE,
    });
  } catch (err) {
    // Transient Meta/network failures are thrown for the queue to retry; the inbox has no queue, so surface them.
    if (err instanceof MetaApiError) throw new ApiError(502, `Meta didn't accept the message: ${err.message}`, "META_ERROR");
    throw err;
  }
  if (result.status !== DeliveryStatus.SENT) throw sendFailure(result);

  await prisma.conversation.updateMany({
    where: { id: conversationId, workspaceId, status: ConversationStatus.CLOSED },
    data: { status: ConversationStatus.OPEN },
  });

  const created = await findSentMessage(conversationId, senderUserId, result.messageId ?? null);
  if (!created) {
    logger.error("inbox.sent_message_missing", { workspaceId, conversationId, messageId: result.messageId });
    throw new ApiError(500, "The message was sent but couldn't be shown. Refresh the conversation.", "INTERNAL");
  }
  logger.info("inbox.reply_sent", { workspaceId, conversationId, senderUserId, humanAgent: Boolean(opts.humanAgent) });
  return created;
}

/** `sendToContact` persists the Message keyed by Meta's mid; fall back to the sender's newest outbound row. */
async function findSentMessage(conversationId: string, senderUserId: string, externalId: string | null): Promise<InboxMessage | null> {
  const row = externalId
    ? await prisma.message.findFirst({ where: { conversationId, externalId }, select: messageSelect })
    : await prisma.message.findFirst({
        where: { conversationId, direction: MessageDirection.OUTBOUND, sentByUserId: senderUserId },
        orderBy: { createdAt: "desc" },
        select: messageSelect,
      });
  return row ? toMessage(row) : null;
}

// ───────────────────────── Meta backfill ─────────────────────────

function previewFor(text: string | null, payload: unknown): string {
  if (text?.trim()) return text.trim().slice(0, 200);
  const p = isRecord(payload) ? payload : {};
  if (isRecord(p.storyReply)) return "[story reply]";
  if (Array.isArray(p.attachments) && p.attachments.length > 0) return "[attachment]";
  return "";
}

/** After a backfill, bring the denormalised columns in line with the messages table (never moves timestamps backwards). */
async function refreshConversationAggregates(conversationId: string): Promise<void> {
  const [conversation, latest, latestInbound] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { lastMessageAt: true, lastInboundAt: true } }),
    prisma.message.findFirst({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true, text: true, payload: true },
    }),
    prisma.message.findFirst({
      where: { conversationId, direction: MessageDirection.INBOUND },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  if (!conversation || !latest) return;

  const data: Prisma.ConversationUpdateInput = {};
  if (!conversation.lastMessageAt || latest.createdAt > conversation.lastMessageAt) {
    data.lastMessageAt = latest.createdAt;
    data.lastMessagePreview = previewFor(latest.text, latest.payload);
  }
  if (latestInbound && (!conversation.lastInboundAt || latestInbound.createdAt > conversation.lastInboundAt)) {
    data.lastInboundAt = latestInbound.createdAt;
  }
  if (Object.keys(data).length > 0) await prisma.conversation.update({ where: { id: conversationId }, data });
}

function directionFor(m: ConversationMessage, channelExternalId: string, contactExternalId: string): MessageDirection {
  if (m.fromId === channelExternalId) return MessageDirection.OUTBOUND;
  if (m.fromId === contactExternalId) return MessageDirection.INBOUND;
  // No usable sender: infer from recipients. Anything addressed to the contact came from us.
  return m.toIds.includes(contactExternalId) ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;
}

/**
 * Pull the latest messages for one thread straight from Meta and upsert them
 * by mid. Used by the Refresh button and when a thread opens with no messages
 * (e.g. the webhook was subscribed after the conversation started). Locates
 * the Graph conversation id on first use and caches it on the row.
 */
export async function syncConversationFromMeta(workspaceId: string, conversationId: string): Promise<SyncResult> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: { channel: true, contact: true },
  });
  if (!conversation) throw notFound();
  const { channel, contact } = conversation;
  if (channel.status !== ChannelStatus.ACTIVE) {
    throw new ApiError(409, "This account is disconnected. Reconnect it on the Channels page.", "CHANNEL_INACTIVE");
  }

  const token = getChannelToken(channel);
  const isInstagram = channel.platform === "INSTAGRAM";

  try {
    let externalId = conversation.externalId;
    if (!externalId) {
      const summaries = isInstagram
        ? await listInstagramConversations(token, channel.externalId)
        : await listFacebookConversations(token, channel.externalId);
      const match = summaries.find((s) => s.participants.some((p) => p.id === contact.externalId));
      if (!match) {
        logger.info("inbox.sync.not_found", { workspaceId, conversationId, contactId: contact.id });
        return { found: false, imported: 0, total: 0 };
      }
      externalId = match.id;
      await prisma.conversation.update({ where: { id: conversationId }, data: { externalId } });

      // Fill in identity we may not have learned from webhooks (comments only carry a username).
      const participant = match.participants.find((p) => p.id === contact.externalId);
      const patch: Prisma.ContactUpdateManyMutationInput = {};
      if (participant?.username && !contact.username) patch.username = participant.username;
      if (participant?.name && !contact.name) patch.name = participant.name;
      if (Object.keys(patch).length > 0) await prisma.contact.updateMany({ where: { id: contact.id, workspaceId }, data: patch });
    }

    const messages = isInstagram
      ? await getInstagramConversationMessages(token, externalId)
      : await getFacebookConversationMessages(token, externalId);

    let imported = 0;
    for (const m of messages) {
      const created = await recordMessage(conversationId, {
        direction: directionFor(m, channel.externalId, contact.externalId),
        externalId: m.id,
        text: m.text,
        payload: { attachments: m.attachments ?? null, synced: true },
        createdAt: m.createdTime,
      });
      if (created) imported++;
    }
    if (imported > 0) await refreshConversationAggregates(conversationId);

    logger.info("inbox.sync", { workspaceId, conversationId, imported, total: messages.length });
    return { found: true, imported, total: messages.length };
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(channel.id, err.message);
      throw new ApiError(409, "Instagram signed this account out. Reconnect it on the Channels page.", "TOKEN_EXPIRED");
    }
    if (err instanceof MetaApiError) throw new ApiError(502, `Meta error: ${err.message}`, "META_ERROR");
    throw err;
  }
}
