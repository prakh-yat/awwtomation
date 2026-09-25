/**
 * Instagram API with Instagram Login (host graph.instagram.com).
 *
 * Ids: `/me` returns `id` (app-scoped user id) AND `user_id` (the Instagram
 * professional account id). Webhook `entry.id`, `recipient.id` and the
 * messaging/media paths all use the professional account id, so
 * `getInstagramMe().id` is that one: store it as `Channel.externalId`.
 */
import { optionalEnv } from "@/lib/env";
import { GRAPH_INSTAGRAM_HOST, INSTAGRAM_OAUTH_HOST, graphUrl, metaFetch, parseGraphDate } from "./client";
import { sendOutbound } from "./messages";
import type {
  ConversationMessage,
  ConversationSummary,
  GraphList,
  InstagramMediaItem,
  MessageTag,
  MetaProfile,
  OutboundMessage,
  PlatformComment,
  SendResult,
} from "./types";

const IG = GRAPH_INSTAGRAM_HOST;

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
] as const;

export const INSTAGRAM_WEBHOOK_FIELDS = ["comments", "messages", "messaging_postbacks", "live_comments"] as const;

/** Long-lived Instagram tokens last 60 days. */
export const INSTAGRAM_TOKEN_LIFETIME_SECONDS = 60 * 24 * 3600;

function credentials(): { appId: string; appSecret: string } {
  const appId = optionalEnv("INSTAGRAM_APP_ID");
  const appSecret = optionalEnv("INSTAGRAM_APP_SECRET");
  if (!appId || !appSecret) throw new Error("Instagram Login is not configured (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET)");
  return { appId, appSecret };
}

// ───────────────────────── OAuth ─────────────────────────

export function buildInstagramAuthUrl(state: string, redirectUri: string): string {
  const { appId } = credentials();
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

type CodeExchangeResponse =
  | { access_token: string; user_id: string | number; permissions?: string | string[] }
  | { data: Array<{ access_token: string; user_id: string | number; permissions?: string | string[] }> };

export async function exchangeInstagramCode(code: string, redirectUri: string): Promise<{ accessToken: string; userId: string; permissions: string[] }> {
  const { appId, appSecret } = credentials();
  const res = await metaFetch<CodeExchangeResponse>(`${INSTAGRAM_OAUTH_HOST}/oauth/access_token`, {
    form: {
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      // Instagram appends `#_` to the redirect; strip it defensively.
      code: code.replace(/#_$/, ""),
    },
  });
  // Instagram Login wraps the result in `data: [...]`; the flat form is kept for safety.
  const entry = "data" in res ? res.data[0] : res;
  if (!entry?.access_token) throw new Error("Instagram code exchange returned no access_token");
  const permissions = Array.isArray(entry.permissions)
    ? entry.permissions
    : typeof entry.permissions === "string"
      ? entry.permissions.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  return { accessToken: entry.access_token, userId: String(entry.user_id), permissions };
}

export async function getInstagramLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { appSecret } = credentials();
  const res = await metaFetch<{ access_token: string; token_type?: string; expires_in?: number }>(
    graphUrl(IG, "/access_token", { grant_type: "ig_exchange_token", client_secret: appSecret, access_token: shortToken }, { versioned: false }),
  );
  return { accessToken: res.access_token, expiresIn: res.expires_in ?? INSTAGRAM_TOKEN_LIFETIME_SECONDS };
}

/** Requires the token to be at least 24h old and not yet expired. */
export async function refreshInstagramToken(longToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await metaFetch<{ access_token: string; token_type?: string; expires_in?: number }>(
    graphUrl(IG, "/refresh_access_token", { grant_type: "ig_refresh_token", access_token: longToken }, { versioned: false }),
  );
  return { accessToken: res.access_token, expiresIn: res.expires_in ?? INSTAGRAM_TOKEN_LIFETIME_SECONDS };
}

// ───────────────────────── Account ─────────────────────────

export type InstagramMe = {
  /** Instagram professional account id: use as Channel.externalId. */
  id: string;
  /** App-scoped user id (the raw `id` field). */
  appScopedId: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  accountType?: string;
};

export async function getInstagramMe(token: string): Promise<InstagramMe> {
  const res = await metaFetch<{
    id: string;
    user_id?: string | number;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    account_type?: string;
  }>(graphUrl(IG, "/me", { fields: "id,user_id,username,name,profile_picture_url,followers_count,account_type" }), { token });
  return {
    id: res.user_id !== undefined ? String(res.user_id) : String(res.id),
    appScopedId: String(res.id),
    username: res.username ?? "",
    name: res.name ?? undefined,
    profilePictureUrl: res.profile_picture_url ?? undefined,
    followersCount: typeof res.followers_count === "number" ? res.followers_count : undefined,
    accountType: res.account_type ?? undefined,
  };
}

export async function subscribeInstagramWebhooks(token: string, igUserId: string): Promise<{ success: boolean }> {
  const res = await metaFetch<{ success?: boolean }>(
    graphUrl(IG, `/${igUserId}/subscribed_apps`, { subscribed_fields: INSTAGRAM_WEBHOOK_FIELDS.join(",") }),
    { token, method: "POST" },
  );
  return { success: res.success === true };
}

// ───────────────────────── Media & comments ─────────────────────────

type RawMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
  like_count?: number;
};

export async function listInstagramMedia(
  token: string,
  igUserId: string,
  opts: { limit?: number; after?: string } = {},
): Promise<{ items: InstagramMediaItem[]; nextCursor?: string }> {
  const res = await metaFetch<GraphList<RawMedia>>(
    graphUrl(IG, `/${igUserId}/media`, {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
      limit: Math.min(Math.max(opts.limit ?? 25, 1), 100),
      after: opts.after,
    }),
    { token },
  );
  const items = (res.data ?? []).map<InstagramMediaItem>((m) => ({
    id: String(m.id),
    caption: m.caption ?? undefined,
    mediaType: m.media_type ?? undefined,
    mediaUrl: m.media_url ?? undefined,
    thumbnailUrl: m.thumbnail_url ?? undefined,
    permalink: m.permalink ?? undefined,
    timestamp: parseGraphDate(m.timestamp),
    commentsCount: m.comments_count ?? undefined,
    likeCount: m.like_count ?? undefined,
  }));
  return { items, nextCursor: res.paging?.next ? res.paging.cursors?.after : undefined };
}

type RawCommentFrom = { id: string | number; username?: string };
type RawComment = {
  id: string;
  text?: string;
  timestamp?: string;
  from?: RawCommentFrom;
  replies?: GraphList<RawComment>;
};

function toComment(raw: RawComment, mediaId: string, parentId?: string): PlatformComment {
  return {
    id: String(raw.id),
    text: raw.text ?? "",
    timestamp: parseGraphDate(raw.timestamp) ?? new Date(0),
    from: raw.from ? { id: String(raw.from.id), username: raw.from.username } : undefined,
    parentId,
    mediaId,
  };
}

/** The comments edge returns at most 50 per call. */
const COMMENT_PAGE_SIZE = 50;
const MAX_COMMENT_PAGES = 10;

/**
 * Top-level comments plus their (first page of) replies, flattened, newest
 * first, none older than `since`.
 *
 * The edge can't filter by time, but it returns top-level comments newest
 * first (Graph API 3.2 and later), so paging stops at the first page whose
 * last, oldest comment is older than `since`: every page after it is older
 * still. A reply comes with its parent, so a new reply under a comment on
 * one of those later pages is left to the webhook.
 */
export async function getInstagramMediaComments(
  token: string,
  mediaId: string,
  opts: { since?: Date; limit?: number; onUsage?: (percent: number) => void } = {},
): Promise<PlatformComment[]> {
  const limit = opts.limit ?? 200;
  const since = opts.since?.getTime();
  const out: PlatformComment[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_COMMENT_PAGES && out.length < limit * 2; page++) {
    const res = await metaFetch<GraphList<RawComment>>(
      graphUrl(IG, `/${mediaId}/comments`, {
        fields: "id,text,timestamp,from{id,username},replies{id,text,timestamp,from{id,username}}",
        limit: COMMENT_PAGE_SIZE,
        after,
      }),
      { token, onUsage: opts.onUsage },
    );
    const data = res.data ?? [];
    for (const c of data) {
      out.push(toComment(c, mediaId));
      for (const r of c.replies?.data ?? []) out.push(toComment(r, mediaId, String(c.id)));
    }
    const oldest = parseGraphDate(data[data.length - 1]?.timestamp);
    if (since !== undefined && oldest && oldest.getTime() < since) break;
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out
    .filter((c) => since === undefined || c.timestamp.getTime() >= since)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

// ───────────────────────── Messaging ─────────────────────────

/** One per comment, within 7 days of the comment, only on the account's own media. */
export function sendInstagramPrivateReply(token: string, igUserId: string, commentId: string, message: OutboundMessage): Promise<SendResult> {
  return sendOutbound({ url: graphUrl(IG, `/${igUserId}/messages`), token, recipient: { comment_id: commentId }, message });
}

/** Standard send: the recipient must be inside the 24h window unless `tag` is HUMAN_AGENT (7 days). */
export function sendInstagramMessage(
  token: string,
  igUserId: string,
  recipientId: string,
  message: OutboundMessage,
  tag?: MessageTag,
): Promise<SendResult> {
  return sendOutbound({
    url: graphUrl(IG, `/${igUserId}/messages`),
    token,
    recipient: { id: recipientId },
    message,
    extra: tag ? { tag } : undefined,
  });
}

export async function replyToInstagramComment(token: string, commentId: string, text: string): Promise<{ id: string }> {
  const res = await metaFetch<{ id: string }>(graphUrl(IG, `/${commentId}/replies`), { token, form: { message: text } });
  return { id: String(res.id) };
}

/**
 * Profile of a messaging user (IGSID). Only works for users who have
 * interacted with the account. `igUserId` is accepted for symmetry with the
 * Facebook helper and future page-scoped lookups; the Graph call is keyed by IGSID.
 */
export async function getInstagramUserProfile(token: string, igUserId: string, igsid: string): Promise<MetaProfile> {
  void igUserId;
  const res = await metaFetch<{
    id?: string;
    name?: string;
    username?: string;
    profile_pic?: string;
    is_user_follow_business?: boolean;
    follower_count?: number;
  }>(graphUrl(IG, `/${igsid}`, { fields: "name,username,profile_pic,is_user_follow_business,follower_count" }), { token });
  return {
    id: res.id ? String(res.id) : igsid,
    name: res.name ?? undefined,
    username: res.username ?? undefined,
    profilePic: res.profile_pic ?? undefined,
    isFollower: typeof res.is_user_follow_business === "boolean" ? res.is_user_follow_business : undefined,
    followerCount: typeof res.follower_count === "number" ? res.follower_count : undefined,
  };
}

// ───────────────────────── Conversations (inbox backfill) ─────────────────────────

type RawParticipant = { id: string | number; username?: string; name?: string };
type RawConversation = {
  id: string;
  updated_time?: string;
  participants?: GraphList<RawParticipant>;
  messages?: GraphList<{ id?: string; message?: string; from?: RawParticipant; created_time?: string }>;
};

export function toConversationSummary(raw: RawConversation): ConversationSummary {
  const last = raw.messages?.data?.[0];
  return {
    id: String(raw.id),
    participants: (raw.participants?.data ?? []).map((p) => ({ id: String(p.id), username: p.username, name: p.name })),
    updatedTime: parseGraphDate(raw.updated_time),
    lastMessage: last
      ? { id: last.id, text: last.message, fromId: last.from ? String(last.from.id) : undefined, createdTime: parseGraphDate(last.created_time) }
      : undefined,
  };
}

export async function listInstagramConversations(token: string, igUserId: string): Promise<ConversationSummary[]> {
  const res = await metaFetch<GraphList<RawConversation>>(
    graphUrl(IG, `/${igUserId}/conversations`, {
      platform: "instagram",
      fields: "id,participants,updated_time,messages.limit(1){id,message,from,created_time}",
      limit: 50,
    }),
    { token },
  );
  return (res.data ?? []).map(toConversationSummary);
}

type RawConversationMessage = {
  id: string;
  created_time?: string;
  from?: RawParticipant;
  to?: GraphList<RawParticipant>;
  message?: string;
  attachments?: GraphList<unknown>;
};

export function toConversationMessage(raw: RawConversationMessage): ConversationMessage {
  return {
    id: String(raw.id),
    createdTime: parseGraphDate(raw.created_time),
    fromId: raw.from ? String(raw.from.id) : undefined,
    toIds: (raw.to?.data ?? []).map((p) => String(p.id)),
    text: raw.message ?? undefined,
    attachments: raw.attachments?.data,
  };
}

export async function getInstagramConversationMessages(token: string, conversationId: string): Promise<ConversationMessage[]> {
  const res = await metaFetch<{ messages?: GraphList<RawConversationMessage> }>(
    graphUrl(IG, `/${conversationId}`, { fields: "messages{id,created_time,from,to,message,attachments}" }),
    { token },
  );
  return (res.messages?.data ?? []).map(toConversationMessage);
}
