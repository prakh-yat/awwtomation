/**
 * Facebook Login + Pages + Messenger (host graph.facebook.com).
 * Channel.externalId for FACEBOOK channels is the Page id; the stored token is
 * the Page access token derived from a long-lived user token (does not expire
 * on its own, but can be invalidated → error 190 → TOKEN_EXPIRED).
 */
import { optionalEnv } from "@/lib/env";
import { GRAPH_FACEBOOK_HOST, graphUrl, graphVersion, metaFetch, metaFetchAll, parseGraphDate } from "./client";
import { toConversationMessage, toConversationSummary } from "./instagram";
import { messageToPlainText, sendOutbound } from "./messages";
import type {
  ConversationMessage,
  ConversationSummary,
  FacebookPageInfo,
  FacebookPostItem,
  GraphList,
  MessageTag,
  MetaProfile,
  OutboundMessage,
  PlatformComment,
  SendResult,
} from "./types";

const FB = GRAPH_FACEBOOK_HOST;

export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_read_engagement",
  "pages_manage_engagement",
  "pages_read_user_content",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
] as const;

export const PAGE_WEBHOOK_FIELDS = ["feed", "messages", "messaging_postbacks"] as const;

function credentials(): { appId: string; appSecret: string } {
  const appId = optionalEnv("META_APP_ID");
  const appSecret = optionalEnv("META_APP_SECRET");
  if (!appId || !appSecret) throw new Error("Facebook Login is not configured (META_APP_ID / META_APP_SECRET)");
  return { appId, appSecret };
}

// ───────────────────────── OAuth ─────────────────────────

export function buildFacebookAuthUrl(state: string, redirectUri: string): string {
  const { appId } = credentials();
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FACEBOOK_SCOPES.join(","));
  return url.toString();
}

export async function exchangeFacebookCode(code: string, redirectUri: string): Promise<{ accessToken: string; expiresIn?: number }> {
  const { appId, appSecret } = credentials();
  const res = await metaFetch<{ access_token: string; token_type?: string; expires_in?: number }>(
    graphUrl(FB, "/oauth/access_token", { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }),
  );
  return { accessToken: res.access_token, expiresIn: res.expires_in };
}

export async function getFacebookLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn?: number }> {
  const { appId, appSecret } = credentials();
  const res = await metaFetch<{ access_token: string; token_type?: string; expires_in?: number }>(
    graphUrl(FB, "/oauth/access_token", { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken }),
  );
  return { accessToken: res.access_token, expiresIn: res.expires_in };
}

// ───────────────────────── Pages ─────────────────────────

type RawPage = {
  id: string;
  name?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id?: string };
};

const PAGE_FIELDS = "id,name,access_token,picture{url},instagram_business_account";

/**
 * Page ids the user granted in the login dialog's asset picker. With Facebook
 * Login for Business, a Page reached through a business portfolio (or picked
 * under "Edit settings") is granted here but often missing from /me/accounts.
 */
async function grantedPageIds(userToken: string): Promise<string[]> {
  const { appId, appSecret } = credentials();
  const res = await metaFetch<{ data?: { granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> } }>(
    graphUrl(FB, "/debug_token", { input_token: userToken }),
    { token: `${appId}|${appSecret}` },
  );
  const ids = new Set<string>();
  for (const grant of res.data?.granular_scopes ?? []) {
    if (grant.scope === "pages_show_list" || grant.scope === "pages_messaging") {
      for (const id of grant.target_ids ?? []) ids.add(String(id));
    }
  }
  return [...ids];
}

export async function listFacebookPages(userToken: string): Promise<FacebookPageInfo[]> {
  let pages = await metaFetchAll<RawPage>(graphUrl(FB, "/me/accounts", { fields: PAGE_FIELDS, limit: 100 }), userToken, { maxItems: 500 });
  if (pages.length === 0) {
    const ids = await grantedPageIds(userToken);
    const found = await Promise.all(
      ids.map((id) => metaFetch<RawPage>(graphUrl(FB, `/${id}`, { fields: PAGE_FIELDS }), { token: userToken }).catch(() => null)),
    );
    pages = found.filter((p): p is RawPage => p !== null);
  }
  return pages
    .filter((p) => Boolean(p.access_token))
    .map((p) => ({
      id: String(p.id),
      name: p.name ?? "",
      accessToken: p.access_token as string,
      picture: p.picture?.data?.url,
      instagramBusinessId: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : undefined,
    }));
}

export async function subscribePageWebhooks(pageToken: string, pageId: string): Promise<{ success: boolean }> {
  const res = await metaFetch<{ success?: boolean }>(
    graphUrl(FB, `/${pageId}/subscribed_apps`, { subscribed_fields: PAGE_WEBHOOK_FIELDS.join(",") }),
    { token: pageToken, method: "POST" },
  );
  return { success: res.success === true };
}

// ───────────────────────── Messaging ─────────────────────────

export function sendMessengerMessage(pageToken: string, pageId: string, psid: string, message: OutboundMessage, tag?: MessageTag): Promise<SendResult> {
  return sendOutbound({
    url: graphUrl(FB, `/${pageId}/messages`),
    token: pageToken,
    recipient: { id: psid },
    message,
    extra: tag ? { messaging_type: "MESSAGE_TAG", tag } : { messaging_type: "RESPONSE" },
  });
}

/** Facebook private replies are text only: buttons are flattened to "Title: url" lines. */
export async function sendFacebookPrivateReply(pageToken: string, commentId: string, message: OutboundMessage): Promise<SendResult> {
  const text = messageToPlainText(message);
  if (!text) throw new Error("Facebook private replies require text");
  const res = await metaFetch<{ id?: string }>(graphUrl(FB, `/${commentId}/private_replies`), { token: pageToken, json: { message: text } });
  return { messageId: res.id ?? null, recipientId: null };
}

export async function replyToFacebookComment(pageToken: string, commentId: string, text: string): Promise<{ id: string }> {
  const res = await metaFetch<{ id: string }>(graphUrl(FB, `/${commentId}/comments`), { token: pageToken, form: { message: text } });
  return { id: String(res.id) };
}

export async function getFacebookUserProfile(pageToken: string, psid: string): Promise<MetaProfile> {
  const res = await metaFetch<{ id?: string; first_name?: string; last_name?: string; profile_pic?: string }>(
    graphUrl(FB, `/${psid}`, { fields: "first_name,last_name,profile_pic" }),
    { token: pageToken },
  );
  const name = [res.first_name, res.last_name].filter(Boolean).join(" ");
  return { id: res.id ? String(res.id) : psid, name: name || undefined, profilePic: res.profile_pic ?? undefined };
}

// ───────────────────────── Posts & comments ─────────────────────────

type RawPost = {
  id: string;
  message?: string;
  created_time?: string;
  full_picture?: string;
  permalink_url?: string;
  comments?: { summary?: { total_count?: number } };
};

export async function listFacebookPosts(pageToken: string, pageId: string, opts: { limit?: number } = {}): Promise<FacebookPostItem[]> {
  const res = await metaFetch<GraphList<RawPost>>(
    graphUrl(FB, `/${pageId}/posts`, {
      fields: "id,message,created_time,full_picture,permalink_url,comments.summary(true)",
      limit: Math.min(Math.max(opts.limit ?? 25, 1), 100),
    }),
    { token: pageToken },
  );
  return (res.data ?? []).map((p) => ({
    id: String(p.id),
    message: p.message ?? undefined,
    createdTime: parseGraphDate(p.created_time),
    fullPicture: p.full_picture ?? undefined,
    permalinkUrl: p.permalink_url ?? undefined,
    commentCount: p.comments?.summary?.total_count,
  }));
}

type RawFbComment = {
  id: string;
  message?: string;
  from?: { id: string | number; name?: string };
  created_time?: string;
  parent?: { id?: string };
};

/**
 * `filter=stream` returns top-level comments and replies flat; reverse
 * chronological lets us stop paging as soon as we're past `since`.
 */
export async function getFacebookPostComments(
  pageToken: string,
  postId: string,
  opts: { since?: Date; limit?: number } = {},
): Promise<PlatformComment[]> {
  const limit = opts.limit ?? 200;
  const since = opts.since?.getTime();
  const out: PlatformComment[] = [];
  let url: string | undefined = graphUrl(FB, `/${postId}/comments`, {
    fields: "id,message,from{id,name},created_time,parent{id}",
    filter: "stream",
    order: "reverse_chronological",
    limit: 50,
  });
  for (let page = 0; url && page < 10 && out.length < limit; page++) {
    const res: GraphList<RawFbComment> = await metaFetch(url, { token: pageToken });
    let pastSince = false;
    for (const c of res.data ?? []) {
      const timestamp = parseGraphDate(c.created_time) ?? new Date(0);
      if (since !== undefined && timestamp.getTime() < since) {
        pastSince = true;
        continue;
      }
      out.push({
        id: String(c.id),
        text: c.message ?? "",
        timestamp,
        // `from` is only present for users who authorized the app or Page admins.
        from: c.from ? { id: String(c.from.id), name: c.from.name } : undefined,
        parentId: c.parent?.id && c.parent.id !== postId ? String(c.parent.id) : undefined,
        mediaId: postId,
      });
    }
    if (pastSince) break;
    url = res.paging?.next;
  }
  return out.slice(0, limit);
}

// ───────────────────────── Conversations (inbox backfill) ─────────────────────────

export async function listFacebookConversations(pageToken: string, pageId: string): Promise<ConversationSummary[]> {
  const res = await metaFetch<GraphList<Parameters<typeof toConversationSummary>[0]>>(
    graphUrl(FB, `/${pageId}/conversations`, {
      platform: "messenger",
      fields: "id,participants,updated_time,messages.limit(1){id,message,from,created_time}",
      limit: 50,
    }),
    { token: pageToken },
  );
  return (res.data ?? []).map(toConversationSummary);
}

export async function getFacebookConversationMessages(pageToken: string, conversationId: string): Promise<ConversationMessage[]> {
  const res = await metaFetch<{ messages?: GraphList<Parameters<typeof toConversationMessage>[0]> }>(
    graphUrl(FB, `/${conversationId}`, { fields: "messages{id,created_time,from,to,message,attachments}" }),
    { token: pageToken },
  );
  return (res.messages?.data ?? []).map(toConversationMessage);
}
