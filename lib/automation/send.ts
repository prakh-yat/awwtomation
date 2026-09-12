/**
 * The ONE place outbound messages are sent. Automations, the Inbox and
 * Broadcasts all go through `sendToContact` so plan quota, rate limits, the
 * 24h window, platform dispatch and Message/DeliveryLog bookkeeping are
 * enforced identically everywhere.
 */
import {
  ChannelPlatform,
  ChannelStatus,
  DeliveryKind,
  DeliveryStatus,
  MessageDirection,
  Prisma,
  type Channel,
  type Contact,
  type DeliveryLog,
} from "@prisma/client";
import { reserveDmQuota } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendFacebookPrivateReply, sendMessengerMessage } from "@/lib/meta/facebook";
import { sendInstagramMessage, sendInstagramPrivateReply } from "@/lib/meta/instagram";
import { messagePreview } from "@/lib/meta/messages";
import { getChannelToken, markChannelTokenExpired } from "@/lib/meta/tokens";
import { MetaApiError, MetaRateLimitError, MetaTokenError, type MessageTag, type OutboundMessage, type SendResult } from "@/lib/meta/types";
import { HOUR_SECONDS, MINUTE_SECONDS, PRIVATE_REPLY_LIMIT_PER_HOUR, SEND_LIMIT_PER_MINUTE, reserveSlot } from "@/lib/rate-limit";
import { renderTemplate } from "./flow-types";

export const MESSAGING_WINDOW_MS = 24 * 3600 * 1000;
/** HUMAN_AGENT tag: a person may reply up to 7 days after the last inbound message. */
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 3600 * 1000;
/** Meta rejects rate-limited retries after this long; give up and log SKIPPED_RATE_LIMIT. */
export const RATE_LIMIT_MAX_DEFER_MS = 6 * 3600 * 1000;
/** Fallback wait when Meta itself throttles us (no reset hint in the error). */
export const META_RATE_LIMIT_RETRY_MS = 5 * 60_000;

export type SendToContactInput = {
  channel: Channel;
  contact: Contact;
  message: OutboundMessage;
  /** First send of a comment-triggered session: uses the private-reply API (no window needed). */
  viaPrivateReplyCommentId?: string;
  automationId?: string;
  broadcastId?: string;
  sentByUserId?: string;
  tag?: MessageTag;
  /** Template variables ({{username}}, {{name}}, {{first_name}}); merged over the contact's own. */
  vars?: Record<string, string | undefined>;
  /** Override the DeliveryLog kind (derived from the other fields by default). */
  kind?: DeliveryKind;
};

export type SendToContactResult = {
  status: DeliveryStatus;
  error?: string;
  messageId?: string | null;
  deliveryLogId?: string;
  /** SKIPPED_RATE_LIMIT only: the caller may re-run after `retryAt` (no DeliveryLog was written yet). */
  retryable?: boolean;
  retryAt?: Date;
};

// ───────────────────────── Helpers ─────────────────────────

/** postback buttons → `btn:${nodeId}:${i}`, quick replies → `qr:${nodeId}:${i}`. `follow_check:` payloads are preserved. */
export function attachPostbackPayloads(nodeId: string, message: OutboundMessage): OutboundMessage {
  const buttons = message.buttons?.map((b, i) =>
    b.type === "postback" && !b.payload.startsWith("follow_check:") ? { ...b, payload: `btn:${nodeId}:${i}` } : b,
  );
  const quickReplies = message.quickReplies?.map((q, i) => ({ ...q, payload: `qr:${nodeId}:${i}` }));
  return { ...message, ...(buttons ? { buttons } : {}), ...(quickReplies ? { quickReplies } : {}) };
}

export function contactTemplateVars(contact: Pick<Contact, "username" | "name">): Record<string, string | undefined> {
  const name = contact.name?.trim() || undefined;
  const username = contact.username?.trim() || undefined;
  return {
    username: username ? `@${username.replace(/^@/, "")}` : undefined,
    name: name ?? username,
    first_name: name?.split(/\s+/)[0] ?? username,
  };
}

export function renderMessage(message: OutboundMessage, vars: Record<string, string | undefined>): OutboundMessage {
  return {
    ...message,
    text: message.text !== undefined ? renderTemplate(message.text, vars) : undefined,
    buttons: message.buttons?.map((b) =>
      b.type === "web_url"
        ? { ...b, title: renderTemplate(b.title, vars), url: renderTemplate(b.url, encodeVars(vars)) }
        : { ...b, title: renderTemplate(b.title, vars) },
    ),
    quickReplies: message.quickReplies?.map((q) => ({ ...q, title: renderTemplate(q.title, vars) })),
  };
}

function encodeVars(vars: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = v === undefined ? undefined : encodeURIComponent(v);
  return out;
}

export function isWithinWindow(lastInboundAt: Date | null | undefined, windowMs: number, now = Date.now()): boolean {
  return Boolean(lastInboundAt) && now - (lastInboundAt as Date).getTime() < windowMs;
}

export type DeliveryLogInput = {
  workspaceId: string;
  channelId: string;
  kind: DeliveryKind;
  status: DeliveryStatus;
  automationId?: string | null;
  broadcastId?: string | null;
  contactId?: string | null;
  commentExternalId?: string | null;
  recipientExternalId?: string | null;
  recipientUsername?: string | null;
  messagePreview?: string | null;
  errorMessage?: string | null;
  metaResponse?: Prisma.InputJsonValue;
};

export function recordDeliveryLog(input: DeliveryLogInput): Promise<DeliveryLog> {
  return prisma.deliveryLog.create({
    data: {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      kind: input.kind,
      status: input.status,
      automationId: input.automationId ?? undefined,
      broadcastId: input.broadcastId ?? undefined,
      contactId: input.contactId ?? undefined,
      commentExternalId: input.commentExternalId ?? undefined,
      recipientExternalId: input.recipientExternalId ?? undefined,
      recipientUsername: input.recipientUsername ?? undefined,
      messagePreview: input.messagePreview ?? undefined,
      errorMessage: input.errorMessage?.slice(0, 1000) ?? undefined,
      metaResponse: input.metaResponse,
    },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function dispatch(channel: Channel, contact: Contact, message: OutboundMessage, viaPrivateReplyCommentId?: string, tag?: MessageTag): Promise<SendResult> {
  const token = getChannelToken(channel);
  if (channel.platform === ChannelPlatform.INSTAGRAM) {
    return viaPrivateReplyCommentId
      ? sendInstagramPrivateReply(token, channel.externalId, viaPrivateReplyCommentId, message)
      : sendInstagramMessage(token, channel.externalId, contact.externalId, message, tag);
  }
  return viaPrivateReplyCommentId
    ? sendFacebookPrivateReply(token, viaPrivateReplyCommentId, message)
    : sendMessengerMessage(token, channel.externalId, contact.externalId, message, tag);
}

/** Persist the outbound Message (idempotent on mid — the echo webhook may have landed first) and bump counters. */
async function persistOutbound(input: SendToContactInput, message: OutboundMessage, result: SendResult, preview: string): Promise<void> {
  const { channel, contact } = input;
  const now = new Date();
  const conversation = await prisma.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
    create: { workspaceId: channel.workspaceId, channelId: channel.id, contactId: contact.id, lastMessageAt: now, lastMessagePreview: preview },
    update: { lastMessageAt: now, lastMessagePreview: preview },
    select: { id: true },
  });

  const payload = {
    ...message,
    meta: {
      kind: input.kind ?? (input.viaPrivateReplyCommentId ? "PRIVATE_REPLY" : input.broadcastId ? "BROADCAST" : "MESSAGE"),
      viaPrivateReplyCommentId: input.viaPrivateReplyCommentId ?? null,
      tag: input.tag ?? null,
      automated: Boolean(input.automationId || input.broadcastId),
    },
  } as Prisma.InputJsonValue;

  const data = {
    conversationId: conversation.id,
    direction: MessageDirection.OUTBOUND,
    externalId: result.messageId ?? undefined,
    text: message.text ?? null,
    payload,
    sentByUserId: input.sentByUserId,
    automationId: input.automationId,
  };
  try {
    await prisma.message.create({ data });
  } catch (err) {
    if (!isUniqueViolation(err) || !result.messageId) throw err;
    await prisma.message.update({
      where: { externalId: result.messageId },
      data: { payload, sentByUserId: input.sentByUserId, automationId: input.automationId, text: message.text ?? null },
    });
  }

  if (input.automationId) {
    await prisma.automation.update({ where: { id: input.automationId }, data: { sentCount: { increment: 1 } } });
  }
}

// ───────────────────────── Main entry ─────────────────────────

export async function sendToContact(input: SendToContactInput): Promise<SendToContactResult> {
  const { channel, contact, viaPrivateReplyCommentId, tag } = input;
  if (contact.channelId !== channel.id || contact.workspaceId !== channel.workspaceId) {
    throw new Error("sendToContact: contact does not belong to the channel/workspace");
  }

  const kind = input.kind ?? (viaPrivateReplyCommentId ? DeliveryKind.PRIVATE_REPLY : input.broadcastId ? DeliveryKind.BROADCAST : DeliveryKind.MESSAGE);
  const vars = { ...contactTemplateVars(contact), ...(input.vars ?? {}) };
  const message = renderMessage(input.message, vars);
  const preview = messagePreview(message);

  const base: Omit<DeliveryLogInput, "status"> = {
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    kind,
    automationId: input.automationId,
    broadcastId: input.broadcastId,
    contactId: contact.id,
    commentExternalId: viaPrivateReplyCommentId,
    recipientExternalId: contact.externalId,
    recipientUsername: contact.username,
    messagePreview: preview,
  };

  const skip = async (status: DeliveryStatus, error: string, metaResponse?: Prisma.InputJsonValue): Promise<SendToContactResult> => {
    const log = await recordDeliveryLog({ ...base, status, errorMessage: error, metaResponse });
    logger.info("send.skipped", { status, channelId: channel.id, contactId: contact.id, automationId: input.automationId, broadcastId: input.broadcastId, error });
    return { status, error, deliveryLogId: log.id };
  };

  // Meta forbids messaging the account itself; it also wastes a private reply.
  if (contact.externalId === channel.externalId) return skip(DeliveryStatus.SKIPPED_SELF, "Recipient is the connected account");
  if (contact.optedOut) return skip(DeliveryStatus.SKIPPED_OPTED_OUT, "Contact opted out of messages");
  if (channel.status !== ChannelStatus.ACTIVE) return skip(DeliveryStatus.FAILED, `Channel is ${channel.status.toLowerCase().replace("_", " ")}`);

  if (viaPrivateReplyCommentId) {
    // One private reply per comment — Meta rejects the second, so don't spend a slot on it.
    const already = await prisma.deliveryLog.findFirst({
      where: { channelId: channel.id, commentExternalId: viaPrivateReplyCommentId, kind: DeliveryKind.PRIVATE_REPLY, status: DeliveryStatus.SENT },
      select: { id: true },
    });
    if (already) return skip(DeliveryStatus.SKIPPED_DUPLICATE, "A private reply was already sent for this comment");
  } else {
    const conversation = await prisma.conversation.findUnique({
      where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
      select: { lastInboundAt: true },
    });
    const last = conversation?.lastInboundAt ?? null;
    const open = isWithinWindow(last, MESSAGING_WINDOW_MS) || (tag === "HUMAN_AGENT" && isWithinWindow(last, HUMAN_AGENT_WINDOW_MS));
    if (!open) {
      return skip(
        DeliveryStatus.SKIPPED_WINDOW,
        last ? `Outside the 24h messaging window (last inbound ${last.toISOString()})` : "Contact has never messaged this account",
      );
    }
  }

  // Rate limit before quota: a wasted rate slot refills within the hour, a wasted quota unit does not.
  const slot = viaPrivateReplyCommentId
    ? await reserveSlot(channel.id, "private_reply", PRIVATE_REPLY_LIMIT_PER_HOUR, HOUR_SECONDS)
    : await reserveSlot(channel.id, "send", SEND_LIMIT_PER_MINUTE, MINUTE_SECONDS);
  if (!slot.allowed) {
    logger.warn("send.rate_limited", { channelId: channel.id, bucket: viaPrivateReplyCommentId ? "private_reply" : "send", count: slot.count, resetAt: slot.resetAt.toISOString() });
    return { status: DeliveryStatus.SKIPPED_RATE_LIMIT, retryable: true, retryAt: slot.resetAt, error: "Local rate limit reached" };
  }

  const quota = await reserveDmQuota(channel.workspaceId, 1);
  if (!quota.ok) return skip(DeliveryStatus.SKIPPED_PLAN_LIMIT, `Monthly DM limit reached (${quota.used}/${quota.limit})`);

  let result: SendResult;
  try {
    result = await dispatch(channel, contact, message, viaPrivateReplyCommentId, tag);
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(channel.id, err.message);
      return skip(DeliveryStatus.FAILED, `Channel token invalid: ${err.message}`, metaErrorJson(err));
    }
    if (err instanceof MetaRateLimitError) {
      logger.warn("send.meta_rate_limited", { channelId: channel.id, code: err.code, subcode: err.subcode });
      return { status: DeliveryStatus.SKIPPED_RATE_LIMIT, retryable: true, retryAt: new Date(Date.now() + META_RATE_LIMIT_RETRY_MS), error: err.message };
    }
    if (err instanceof MetaApiError && !err.retryable) {
      return skip(DeliveryStatus.FAILED, err.message, metaErrorJson(err));
    }
    // Network / 5xx / unexpected: let the queue retry with backoff.
    throw err;
  }

  await persistOutbound(input, message, result, preview);
  const log = await recordDeliveryLog({
    ...base,
    status: DeliveryStatus.SENT,
    metaResponse: { messageId: result.messageId, recipientId: result.recipientId },
  });
  logger.info("send.sent", { channelId: channel.id, contactId: contact.id, kind, automationId: input.automationId, broadcastId: input.broadcastId, messageId: result.messageId });
  return { status: DeliveryStatus.SENT, messageId: result.messageId, deliveryLogId: log.id };
}

function metaErrorJson(err: MetaApiError): Prisma.InputJsonValue {
  return { name: err.name, message: err.message, code: err.code ?? null, subcode: err.subcode ?? null, status: err.status ?? null, traceId: err.traceId ?? null };
}
