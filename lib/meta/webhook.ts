import type { ChannelPlatform } from "@prisma/client";
import { constantTimeEqual, hmacSha256, sha256 } from "@/lib/crypto";
import type { NormalizedEvent } from "./types";

// ───────────────────────── Signature ─────────────────────────

/** `X-Hub-Signature-256: sha256=<hex hmac of the raw body>`. */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [scheme, provided] = signatureHeader.trim().split("=");
  if (scheme !== "sha256" || !provided) return false;
  const expected = hmacSha256(appSecret, rawBody);
  return constantTimeEqual(provided.toLowerCase(), expected);
}

// ───────────────────────── Normalization ─────────────────────────

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Meta mixes unix seconds (entry.time, created_time) and milliseconds (messaging.timestamp). */
function toDate(value: unknown): Date | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (Number.isNaN(n) || n <= 0) return undefined;
  return new Date(n > 1e11 ? n : n * 1000);
}

function idOf(value: unknown): string | undefined {
  return isRec(value) ? str(value.id) : undefined;
}

/**
 * Null for a change that is nothing to us: a Page's likes, reactions, shares
 * and posts, and any edit, removal or hide of a comment, which arrives under
 * the id of the comment it changes and is not a new comment to reply to.
 * Fields we do not handle come back as "unknown".
 */
function normalizeChange(platform: ChannelPlatform, entryId: string, entryTime: Date, change: unknown): NormalizedEvent | null {
  if (!isRec(change)) return null;
  const field = str(change.field) ?? "";
  const value = change.value;
  const unknown: NormalizedEvent = { kind: "unknown", platform, channelExternalId: entryId, raw: change };

  if (platform === "FACEBOOK" && field === "feed") {
    // Everything that happens on the Page arrives through `feed`; only a new comment is ours.
    if (!isRec(value) || value.item !== "comment" || value.verb !== "add") return null;
    return facebookComment(platform, entryId, entryTime, change, value) ?? unknown;
  }

  if (!isRec(value)) return unknown;

  if (platform === "INSTAGRAM" && (field === "comments" || field === "live_comments")) {
    // Instagram sends a new comment with no verb at all. Should one ever carry a verb, anything but "add" (Facebook's
    // "edited", "remove", "hide") is a change to a comment already there.
    const verb = str(value.verb);
    if (verb && verb !== "add") return null;
    const commentId = str(value.id);
    const mediaId = idOf(value.media);
    const fromId = idOf(value.from);
    if (!commentId || !mediaId || !fromId) return unknown;
    return {
      kind: "comment",
      platform,
      channelExternalId: entryId,
      commentId,
      mediaId,
      parentCommentId: str(value.parent_id),
      text: str(value.text) ?? "",
      from: { id: fromId, username: isRec(value.from) ? str(value.from.username) : undefined },
      timestamp: toDate(value.created_time) ?? entryTime,
      raw: change,
    };
  }

  return unknown;
}

/** A `feed` change already known to be a new comment; null when it lacks the ids a reply needs. */
function facebookComment(platform: ChannelPlatform, entryId: string, entryTime: Date, change: Rec, value: Rec): NormalizedEvent | null {
  const commentId = str(value.comment_id);
  const postId = str(value.post_id);
  if (!commentId || !postId) return null;
  const parentId = str(value.parent_id);
  // `from` may be absent (users who haven't authorized the app); the engine handles that.
  const from = isRec(value.from) ? value.from : undefined;
  return {
    kind: "comment",
    platform,
    channelExternalId: entryId,
    commentId,
    mediaId: postId,
    // Facebook sets parent_id = post_id for top-level comments.
    parentCommentId: parentId && parentId !== postId ? parentId : undefined,
    text: str(value.message) ?? "",
    from: { id: (from && str(from.id)) ?? "", username: from ? str(from.name) : undefined },
    timestamp: toDate(value.created_time) ?? entryTime,
    raw: change,
  };
}

function normalizeMessaging(platform: ChannelPlatform, entryId: string, item: unknown): NormalizedEvent | null {
  if (!isRec(item)) return null;
  const senderId = idOf(item.sender);
  const recipientId = idOf(item.recipient);
  const timestamp = toDate(item.timestamp) ?? new Date();
  if (!senderId || !recipientId) return { kind: "unknown", platform, channelExternalId: entryId, raw: item };

  if (isRec(item.message)) {
    const message = item.message;
    const messageId = str(message.mid);
    if (!messageId) return { kind: "unknown", platform, channelExternalId: entryId, raw: item };
    // An unsent message comes back under its own mid with `is_deleted`: nothing new was said.
    if (message.is_deleted === true) return null;
    const replyTo = isRec(message.reply_to) ? message.reply_to : undefined;
    const story = replyTo && isRec(replyTo.story) ? replyTo.story : undefined;
    const quickReply = isRec(message.quick_reply) ? str(message.quick_reply.payload) : undefined;
    const attachments = Array.isArray(message.attachments) ? message.attachments : undefined;
    return {
      kind: "message",
      platform,
      channelExternalId: entryId,
      messageId,
      senderId,
      recipientId,
      text: str(message.text),
      attachments,
      storyReply: story ? { storyId: str(story.id), url: str(story.url) } : undefined,
      quickReplyPayload: quickReply,
      isEcho: message.is_echo === true,
      timestamp,
      raw: item,
    };
  }

  if (isRec(item.postback)) {
    const payload = str(item.postback.payload);
    if (!payload) return { kind: "unknown", platform, channelExternalId: entryId, raw: item };
    return {
      kind: "postback",
      platform,
      channelExternalId: entryId,
      senderId,
      recipientId,
      payload,
      title: str(item.postback.title),
      postbackId: str(item.postback.mid),
      timestamp,
      raw: item,
    };
  }

  if (isRec(item.read)) return { kind: "read", platform, channelExternalId: entryId, raw: item };
  if (isRec(item.delivery)) return { kind: "delivery", platform, channelExternalId: entryId, raw: item };
  return { kind: "unknown", platform, channelExternalId: entryId, raw: item };
}

/**
 * Flatten a webhook body (`object: "instagram" | "page"`) into NormalizedEvents.
 * Malformed input yields an empty array: never throws. `entry.id` is the IG
 * professional account id / Page id and becomes `channelExternalId` for every
 * event in that entry (it matches `Channel.externalId`).
 */
export function normalizeWebhookPayload(body: unknown): NormalizedEvent[] {
  if (!isRec(body)) return [];
  const platform: ChannelPlatform | null = body.object === "instagram" ? "INSTAGRAM" : body.object === "page" ? "FACEBOOK" : null;
  if (!platform) return [];

  const events: NormalizedEvent[] = [];
  for (const entry of arr(body.entry)) {
    if (!isRec(entry)) continue;
    const entryId = str(entry.id);
    if (!entryId) continue;
    const entryTime = toDate(entry.time) ?? new Date();
    for (const change of arr(entry.changes)) {
      const event = normalizeChange(platform, entryId, entryTime, change);
      if (event) events.push(event);
    }
    for (const item of arr(entry.messaging)) {
      const event = normalizeMessaging(platform, entryId, item);
      if (event) events.push(event);
    }
    // `standby[]` (handover protocol) mirrors messages for secondary receivers: intentionally ignored.
  }
  return events;
}

/** Stable idempotency key; Meta redelivers webhooks, and reconcile replays comments. */
export function webhookDedupeKey(event: NormalizedEvent): string {
  switch (event.kind) {
    case "comment":
      return `${event.platform}:comment:${event.commentId}`;
    case "message":
      return `${event.platform}:message:${event.messageId}`;
    case "postback":
      return `${event.platform}:postback:${event.postbackId ?? `${event.senderId}:${event.timestamp.getTime()}`}`;
    default:
      return `${event.platform}:${event.kind}:${sha256(stableStringify(event.raw))}`;
  }
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "unserializable";
  }
}
