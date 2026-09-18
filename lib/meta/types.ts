import type { ChannelPlatform } from "@prisma/client";

// ───────────────────────── Outbound message shape ─────────────────────────
// This is the platform-neutral message the flow builder, inbox and broadcasts
// all produce. `lib/meta/messages.ts` turns it into Graph API payloads.

export type OutboundButton =
  | { type: "web_url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

export type OutboundQuickReply = { title: string; payload: string };

export type OutboundMessage = {
  text?: string;
  buttons?: OutboundButton[];
  imageUrl?: string;
  quickReplies?: OutboundQuickReply[];
};

/** The only message tag we use: lets a human agent reply up to 7 days after the last inbound. */
export type MessageTag = "HUMAN_AGENT";

export type MetaProfile = {
  id: string;
  username?: string;
  name?: string;
  profilePic?: string;
  isFollower?: boolean;
  followerCount?: number;
};

// ───────────────────────── Normalized webhook events ─────────────────────────
// Instagram and Page webhooks have different envelopes; everything downstream
// (processor, engine, reconcile) only ever sees these.

export type NormalizedEvent =
  | {
      kind: "comment";
      platform: ChannelPlatform;
      channelExternalId: string;
      commentId: string;
      mediaId: string;
      parentCommentId?: string;
      text: string;
      from: { id: string; username?: string };
      timestamp: Date;
      raw: unknown;
    }
  | {
      kind: "message";
      platform: ChannelPlatform;
      channelExternalId: string;
      messageId: string;
      senderId: string;
      recipientId: string;
      text?: string;
      attachments?: unknown[];
      storyReply?: { storyId?: string; url?: string };
      /** Present when the user tapped a quick reply (payload we generated as `qr:${nodeId}:${i}`). */
      quickReplyPayload?: string;
      isEcho: boolean;
      timestamp: Date;
      raw: unknown;
    }
  | {
      kind: "postback";
      platform: ChannelPlatform;
      channelExternalId: string;
      senderId: string;
      recipientId: string;
      payload: string;
      title?: string;
      /** Meta message id of the postback (`postback.mid`) when provided: used for idempotency. */
      postbackId?: string;
      timestamp: Date;
      raw: unknown;
    }
  | { kind: "read" | "delivery" | "unknown"; platform: ChannelPlatform; channelExternalId: string; raw: unknown };

export type NormalizedCommentEvent = Extract<NormalizedEvent, { kind: "comment" }>;
export type NormalizedMessageEvent = Extract<NormalizedEvent, { kind: "message" }>;
export type NormalizedPostbackEvent = Extract<NormalizedEvent, { kind: "postback" }>;

// ───────────────────────── Graph API response shapes ─────────────────────────

export type GraphPaging = { cursors?: { before?: string; after?: string }; next?: string; previous?: string };
export type GraphList<T> = { data?: T[]; paging?: GraphPaging };

/** Result of a send call. Meta returns `{ recipient_id, message_id }`; FB private replies return `{ id }`. */
export type SendResult = { messageId: string | null; recipientId: string | null };

export type InstagramMediaItem = {
  id: string;
  caption?: string;
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp?: Date;
  commentsCount?: number;
  likeCount?: number;
};

/** A comment from either platform, flattened (replies carry `parentId`). */
export type PlatformComment = {
  id: string;
  text: string;
  timestamp: Date;
  from?: { id: string; username?: string; name?: string };
  parentId?: string;
  mediaId?: string;
};

export type FacebookPageInfo = {
  id: string;
  name: string;
  accessToken: string;
  picture?: string;
  instagramBusinessId?: string;
};

export type FacebookPostItem = {
  id: string;
  message?: string;
  createdTime?: Date;
  fullPicture?: string;
  permalinkUrl?: string;
  commentCount?: number;
};

export type ConversationSummary = {
  id: string;
  participants: Array<{ id: string; username?: string; name?: string }>;
  updatedTime?: Date;
  lastMessage?: { id?: string; text?: string; fromId?: string; createdTime?: Date };
};

export type ConversationMessage = {
  id: string;
  createdTime?: Date;
  fromId?: string;
  toIds: string[];
  text?: string;
  attachments?: unknown[];
};

// ───────────────────────── Errors ─────────────────────────

export class MetaApiError extends Error {
  /** Set by the client for 5xx / `is_transient` responses; the queue retries these. */
  public isTransient = false;

  constructor(
    message: string,
    public code?: number,
    public subcode?: number,
    public status?: number,
    public traceId?: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  /** Whether a retry is likely to succeed. Subclasses override to a fixed answer. */
  get retryable(): boolean {
    return this.isTransient;
  }
}

/** Graph error codes 4 / 17 / 32 / 613 / 80xxx, subcode 2534022, or HTTP 429. Retry later. */
export class MetaRateLimitError extends MetaApiError {
  constructor(message: string, code?: number, subcode?: number, status?: number, traceId?: string) {
    super(message, code, subcode, status, traceId);
    this.name = "MetaRateLimitError";
  }
  override get retryable(): boolean {
    return true;
  }
}

/** Graph error code 190 / 102: the channel token is invalid or expired. Never retry: reconnect. */
export class MetaTokenError extends MetaApiError {
  constructor(message: string, code?: number, subcode?: number, status?: number, traceId?: string) {
    super(message, code, subcode, status, traceId);
    this.name = "MetaTokenError";
  }
  override get retryable(): boolean {
    return false;
  }
}

/** fetch() itself failed (DNS, reset, timeout) or Meta answered with non-JSON. Always retryable. */
export class MetaNetworkError extends MetaApiError {
  constructor(message: string, status?: number) {
    super(message, undefined, undefined, status);
    this.name = "MetaNetworkError";
    this.isTransient = true;
  }
  override get retryable(): boolean {
    return true;
  }
}
