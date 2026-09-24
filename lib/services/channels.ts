/**
 * Channels service: connected Instagram professional accounts and Facebook
 * Pages. Owns the OAuth completion, token storage, webhook subscription,
 * media cache (post picker) and the Meta deauthorize / data-deletion hooks.
 *
 * Every read/write of tenant data is scoped by `workspaceId`; the only
 * unscoped entry points are `syncChannelMedia` (worker job keyed by channel
 * id) and the Meta callbacks (keyed by Meta's user id: no session exists).
 */
import {
  ChannelPlatform,
  ChannelStatus,
  DeliveryKind,
  DeliveryStatus,
  JobStatus,
  JobType,
  type Channel,
  type Media,
} from "@prisma/client";

import { checkLimit } from "@/lib/billing/usage";
import { categorise } from "@/lib/errors/customer-messages";
import { decrypt, encrypt, randomToken, signState, verifyState } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { GRAPH_FACEBOOK_HOST, graphUrl, metaFetch } from "@/lib/meta/client";
import {
  exchangeFacebookCode,
  FACEBOOK_SCOPES,
  getFacebookLongLivedToken,
  listFacebookPages,
  listFacebookPosts,
  subscribePageWebhooks,
} from "@/lib/meta/facebook";
import {
  exchangeInstagramCode,
  getInstagramLongLivedToken,
  getInstagramMe,
  INSTAGRAM_SCOPES,
  listInstagramMedia,
  subscribeInstagramWebhooks,
} from "@/lib/meta/instagram";
import { getChannelToken, markChannelTokenExpired } from "@/lib/meta/tokens";
import { MetaApiError, MetaTokenError, type FacebookPageInfo } from "@/lib/meta/types";
import { enqueue } from "@/lib/queue";
import { recordAudit } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── Constants ─────────────────────────

const DAY_MS = 24 * 3600 * 1000;
/** Mirrors lib/meta/tokens TOKEN_REFRESH_WINDOW_DAYS: the UI warns when fewer days remain. */
export const TOKEN_WARNING_DAYS = 10;
/** Instagram media pages fetched per sync (50 items each). */
const MEDIA_SYNC_PAGES = 2;
const MEDIA_SYNC_PAGE_SIZE = 50;
/** Cookie that carries the Facebook long-lived user token between the OAuth callback and the page picker. */
export const FACEBOOK_CONNECT_COOKIE = "or_fb_pages";
export const FACEBOOK_CONNECT_MAX_AGE_SECONDS = 10 * 60;
/** Placeholder stored in `accessTokenEnc` once a channel is disconnected; the column is non-nullable. */
const REVOKED_TOKEN = "revoked";

// ───────────────────────── Types ─────────────────────────

export type ChannelHealth = {
  status: ChannelStatus;
  /** Days until the stored token expires; null for tokens without an expiry (Facebook Page tokens). */
  tokenDaysLeft: number | null;
  webhookSubscribed: boolean;
  lastError: string | null;
};

export type ChannelCounts = { automations: number; contacts: number; dms7d: number };

/**
 * Client-safe channel projection. Dates are ISO strings so the same shape
 * works as server-component props and as API JSON. Never carries the token.
 */
export type ChannelSummary = {
  id: string;
  workspaceId: string;
  platform: ChannelPlatform;
  externalId: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  linkedInstagramId: string | null;
  scopes: string[];
  status: ChannelStatus;
  webhookSubscribed: boolean;
  followerCount: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  tokenExpiresAt: string | null;
  connectedById: string | null;
  createdAt: string;
  updatedAt: string;
  counts: ChannelCounts;
  health: ChannelHealth;
};

/** Shape returned by GET /api/channels/[id]/media: consumed by the automations post picker. */
export type MediaSummary = {
  id: string;
  externalId: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  commentCount: number | null;
  likeCount: number | null;
};

export type SelectablePageState = "available" | "connected" | "claimed";

/** A Facebook Page the user manages, annotated with how it relates to this workspace. */
export type SelectablePage = {
  id: string;
  name: string;
  picture: string | null;
  instagramBusinessId: string | null;
  state: SelectablePageState;
};

export type FacebookConnectSession = { workspaceId: string; userId: string; userToken: string };

/** How the connection is doing, in terms a customer can act on. */
export type ChannelHealthState = "ok" | "expiring" | "reconnect" | "not_receiving" | "disconnected";

/**
 * What the browser gets for a channel: no provider ids, scopes, token dates or
 * raw provider errors. A stored error is translated into customer copy first.
 */
export type ChannelView = {
  id: string;
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  status: ChannelStatus;
  lastSyncedAt: string | null;
  counts: ChannelCounts;
  health: { state: ChannelHealthState; daysLeft: number | null; problem: string | null };
};

export function toChannelView(summary: ChannelSummary): ChannelView {
  const days = summary.health.tokenDaysLeft;
  let state: ChannelHealthState = "ok";
  if (summary.status === ChannelStatus.DISCONNECTED) state = "disconnected";
  else if (summary.status !== ChannelStatus.ACTIVE || (days !== null && days <= 0)) state = "reconnect";
  else if (!summary.webhookSubscribed) state = "not_receiving";
  else if (days !== null && days <= TOKEN_WARNING_DAYS) state = "expiring";

  return {
    id: summary.id,
    platform: summary.platform,
    username: summary.username,
    name: summary.name,
    avatarUrl: summary.avatarUrl,
    followerCount: summary.followerCount,
    status: summary.status,
    lastSyncedAt: summary.lastSyncedAt,
    counts: summary.counts,
    health: {
      state,
      daysLeft: state === "expiring" ? days : null,
      problem: summary.lastError && state !== "ok" && state !== "disconnected" ? categorise(summary.lastError).description : null,
    },
  };
}

type MediaRow = Omit<Media, "id" | "channelId" | "syncedAt">;

// ───────────────────────── Health & serialization ─────────────────────────

export function getChannelHealth(
  channel: Pick<Channel, "status" | "tokenExpiresAt" | "webhookSubscribed" | "lastError">,
  now = Date.now(),
): ChannelHealth {
  const tokenDaysLeft = channel.tokenExpiresAt ? Math.ceil((channel.tokenExpiresAt.getTime() - now) / DAY_MS) : null;
  return {
    status: channel.status,
    tokenDaysLeft,
    webhookSubscribed: channel.webhookSubscribed,
    lastError: channel.lastError,
  };
}

function toSummary(channel: Channel, counts: ChannelCounts): ChannelSummary {
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    platform: channel.platform,
    externalId: channel.externalId,
    username: channel.username,
    name: channel.name,
    avatarUrl: channel.avatarUrl,
    linkedInstagramId: channel.linkedInstagramId,
    scopes: channel.scopes,
    status: channel.status,
    webhookSubscribed: channel.webhookSubscribed,
    followerCount: channel.followerCount,
    lastSyncedAt: channel.lastSyncedAt?.toISOString() ?? null,
    lastError: channel.lastError,
    tokenExpiresAt: channel.tokenExpiresAt?.toISOString() ?? null,
    connectedById: channel.connectedById,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    counts,
    health: getChannelHealth(channel),
  };
}

function toMediaSummary(row: Media): MediaSummary {
  return {
    id: row.id,
    externalId: row.externalId,
    caption: row.caption,
    mediaType: row.mediaType,
    thumbnailUrl: row.thumbnailUrl,
    mediaUrl: row.mediaUrl,
    permalink: row.permalink,
    timestamp: row.timestamp?.toISOString() ?? null,
    commentCount: row.commentCount,
    likeCount: row.likeCount,
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ───────────────────────── Reads ─────────────────────────

/** Sent DMs per channel over the last 7 days (private replies, messages, broadcasts: not public comment replies). */
async function dmCountsLast7d(workspaceId: string): Promise<Map<string, number>> {
  const grouped = await prisma.deliveryLog.groupBy({
    by: ["channelId"],
    where: {
      workspaceId,
      status: DeliveryStatus.SENT,
      kind: { in: [DeliveryKind.PRIVATE_REPLY, DeliveryKind.MESSAGE, DeliveryKind.BROADCAST] },
      createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) },
    },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.channelId, g._count._all]));
}

export async function listChannels(workspaceId: string): Promise<ChannelSummary[]> {
  const [channels, dms] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId },
      include: { _count: { select: { automations: true, contacts: true } } },
      // Enum order is ACTIVE, TOKEN_EXPIRED, DISCONNECTED, ERROR: healthy channels first.
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    dmCountsLast7d(workspaceId),
  ]);
  return channels.map((c) =>
    toSummary(c, { automations: c._count.automations, contacts: c._count.contacts, dms7d: dms.get(c.id) ?? 0 }),
  );
}

export async function getChannel(workspaceId: string, id: string): Promise<Channel | null> {
  return prisma.channel.findFirst({ where: { id, workspaceId } });
}

export async function getChannelSummary(workspaceId: string, id: string): Promise<ChannelSummary | null> {
  const channels = await listChannels(workspaceId);
  return channels.find((c) => c.id === id) ?? null;
}

async function requireChannel(workspaceId: string, id: string): Promise<Channel> {
  const channel = await getChannel(workspaceId, id);
  if (!channel) throw new ApiError(404, "That account isn't connected to this workspace", "NOT_FOUND");
  return channel;
}

async function requireSummary(workspaceId: string, id: string): Promise<ChannelSummary> {
  const summary = await getChannelSummary(workspaceId, id);
  if (!summary) throw new ApiError(404, "That account isn't connected to this workspace", "NOT_FOUND");
  return summary;
}

/**
 * Whether the connect button should be offered. Lenient on purpose: a
 * workspace at its channel limit may still *reconnect* an existing account
 * (which consumes no new slot): the authoritative check happens once we know
 * which account came back from Meta (`assertChannelSlots`).
 */
export async function canStartConnect(workspaceId: string, platform: ChannelPlatform): Promise<boolean> {
  const slots = await checkLimit(workspaceId, "channels");
  if (slots.ok) return true;
  const reconnectable = await prisma.channel.count({
    where: { workspaceId, platform, status: { not: ChannelStatus.DISCONNECTED } },
  });
  return reconnectable > 0;
}

// ───────────────────────── Connect helpers ─────────────────────────

function planLimitError(limit: number): ApiError {
  return new ApiError(
    403,
    `Your plan allows ${limit} connected account${limit === 1 ? "" : "s"}. Disconnect one or upgrade to add more.`,
    "PLAN_LIMIT",
  );
}

/** Throws PLAN_LIMIT unless `needed` fresh channel slots are free. */
async function assertChannelSlots(workspaceId: string, needed: number): Promise<void> {
  if (needed <= 0) return;
  const slots = await checkLimit(workspaceId, "channels");
  if (slots.used + needed > slots.limit) throw planLimitError(slots.limit);
}

/**
 * Resolves who currently holds `platform + externalId` (globally unique).
 * - Held live by another workspace → 409 CHANNEL_CLAIMED.
 * - Disconnected in another workspace → the stale row is removed (cascading
 *   its cached media/contacts/automations, which are unusable without the
 *   channel) so the account can move to the new owner.
 * - Returns the existing row when it already belongs to this workspace.
 */
async function resolveClaim(workspaceId: string, platform: ChannelPlatform, externalId: string): Promise<Channel | null> {
  const existing = await prisma.channel.findUnique({ where: { platform_externalId: { platform, externalId } } });
  if (!existing) return null;
  if (existing.workspaceId === workspaceId) return existing;

  if (existing.status !== ChannelStatus.DISCONNECTED) {
    throw new ApiError(
      409,
      "This account is already connected to another workspace. Disconnect it there first, then connect it here.",
      "CHANNEL_CLAIMED",
    );
  }

  await prisma.channel.delete({ where: { id: existing.id } });
  logger.warn("channel.stale_claim_removed", {
    channelId: existing.id,
    platform,
    externalId,
    previousWorkspaceId: existing.workspaceId,
    workspaceId,
  });
  await recordAudit({
    workspaceId: existing.workspaceId,
    action: "channel.reclaimed_elsewhere",
    targetType: "channel",
    targetId: existing.id,
    metadata: { platform, externalId, newWorkspaceId: workspaceId },
  });
  return null;
}

/**
 * Subscribes the app to the account's webhooks. A failure is recorded on the
 * channel (visible in the health row) but never fails the connect: polling
 * reconciliation still picks up comments, and the user can hit Refresh.
 */
async function subscribeWebhooks(channel: Pick<Channel, "id" | "platform" | "externalId">, token: string): Promise<boolean> {
  try {
    const { success } =
      channel.platform === ChannelPlatform.INSTAGRAM
        ? await subscribeInstagramWebhooks(token, channel.externalId)
        : await subscribePageWebhooks(token, channel.externalId);
    await prisma.channel.update({
      where: { id: channel.id },
      data: { webhookSubscribed: success, lastError: success ? null : "Meta did not confirm the webhook subscription" },
    });
    if (!success) logger.warn("channel.webhook_unconfirmed", { channelId: channel.id, platform: channel.platform });
    return success;
  } catch (err) {
    const message = errorText(err);
    logger.warn("channel.webhook_subscribe_failed", { channelId: channel.id, platform: channel.platform, error: message });
    await prisma.channel.update({
      where: { id: channel.id },
      data: { webhookSubscribed: false, lastError: `Webhook subscription failed: ${message}`.slice(0, 500) },
    });
    return false;
  }
}

/** The first connected channel completes onboarding; conditional so the timestamp is never overwritten. */
async function markWorkspaceOnboarded(workspaceId: string): Promise<void> {
  await prisma.workspace.updateMany({ where: { id: workspaceId, onboardedAt: null }, data: { onboardedAt: new Date() } });
}

/** One SYNC_MEDIA job per channel per minute: enough to absorb double clicks without starving a real re-sync. */
async function queueMediaSync(channel: Pick<Channel, "id" | "workspaceId">): Promise<void> {
  const minute = Math.floor(Date.now() / 60_000);
  await enqueue({
    type: JobType.SYNC_MEDIA,
    workspaceId: channel.workspaceId,
    payload: { channelId: channel.id },
    dedupeKey: `sync-media:${channel.id}:${minute}`,
    maxAttempts: 3,
  });
}

// ───────────────────────── Instagram ─────────────────────────

export async function connectInstagramAccount(input: {
  workspaceId: string;
  userId: string;
  code: string;
  redirectUri: string;
}): Promise<ChannelSummary> {
  const { workspaceId, userId } = input;
  const short = await exchangeInstagramCode(input.code, input.redirectUri);
  const long = await getInstagramLongLivedToken(short.accessToken);
  const me = await getInstagramMe(long.accessToken);

  const existing = await resolveClaim(workspaceId, ChannelPlatform.INSTAGRAM, me.id);
  // Reconnecting a live channel refreshes its token and needs no new slot.
  await assertChannelSlots(workspaceId, !existing || existing.status === ChannelStatus.DISCONNECTED ? 1 : 0);

  const data = {
    username: me.username || null,
    name: me.name ?? null,
    avatarUrl: me.profilePictureUrl ?? null,
    followerCount: me.followersCount ?? null,
    accessTokenEnc: encrypt(long.accessToken),
    tokenExpiresAt: new Date(Date.now() + long.expiresIn * 1000),
    scopes: short.permissions.length > 0 ? short.permissions : [...INSTAGRAM_SCOPES],
    status: ChannelStatus.ACTIVE,
    lastError: null,
    connectedById: userId,
  };
  const channel = await prisma.channel.upsert({
    where: { platform_externalId: { platform: ChannelPlatform.INSTAGRAM, externalId: me.id } },
    create: { workspaceId, platform: ChannelPlatform.INSTAGRAM, externalId: me.id, ...data },
    update: data,
  });

  await subscribeWebhooks(channel, long.accessToken);
  await queueMediaSync(channel);
  await markWorkspaceOnboarded(workspaceId);
  await recordAudit({
    workspaceId,
    userId,
    action: existing ? "channel.reconnected" : "channel.connected",
    targetType: "channel",
    targetId: channel.id,
    metadata: { platform: "INSTAGRAM", externalId: me.id, username: me.username },
  });
  logger.info("channel.connected", { channelId: channel.id, workspaceId, platform: "INSTAGRAM", reconnect: Boolean(existing) });

  return requireSummary(workspaceId, channel.id);
}

// ───────────────────────── Facebook ─────────────────────────

/** Step 1 of the Facebook flow: code → long-lived user token → the Pages it manages. */
export async function beginFacebookConnect(input: {
  code: string;
  redirectUri: string;
}): Promise<{ userToken: string; pages: FacebookPageInfo[] }> {
  const short = await exchangeFacebookCode(input.code, input.redirectUri);
  const long = await getFacebookLongLivedToken(short.accessToken);
  const pages = await listFacebookPages(long.accessToken);
  return { userToken: long.accessToken, pages };
}

/**
 * The picker session lives in a signed cookie. Only the user token is stored
 * (encrypted, ~500 bytes): the page list is re-fetched, because a full page
 * list with tokens and picture URLs blows past the 4 KB cookie limit.
 */
export function createFacebookConnectSession(input: { workspaceId: string; userId: string; userToken: string }): string {
  return signState({
    workspaceId: input.workspaceId,
    userId: input.userId,
    iat: Math.floor(Date.now() / 1000),
    token: encrypt(input.userToken),
  });
}

export function parseFacebookConnectSession(raw: string | undefined | null): FacebookConnectSession | null {
  if (!raw) return null;
  try {
    const payload = verifyState<{ workspaceId?: unknown; userId?: unknown; token?: unknown }>(raw, FACEBOOK_CONNECT_MAX_AGE_SECONDS);
    if (typeof payload.workspaceId !== "string" || typeof payload.userId !== "string" || typeof payload.token !== "string") return null;
    return { workspaceId: payload.workspaceId, userId: payload.userId, userToken: decrypt(payload.token) };
  } catch {
    return null;
  }
}

/** Pages the user manages, flagged as connected here / claimed elsewhere / available. */
export async function listFacebookPagesForSelection(workspaceId: string, userToken: string): Promise<SelectablePage[]> {
  const pages = await listFacebookPages(userToken);
  if (pages.length === 0) return [];
  const existing = await prisma.channel.findMany({
    where: { platform: ChannelPlatform.FACEBOOK, externalId: { in: pages.map((p) => p.id) } },
    select: { externalId: true, workspaceId: true, status: true },
  });
  const byExternalId = new Map(existing.map((c) => [c.externalId, c]));
  return pages.map((page) => {
    const row = byExternalId.get(page.id);
    let state: SelectablePageState = "available";
    if (row && row.status !== ChannelStatus.DISCONNECTED) state = row.workspaceId === workspaceId ? "connected" : "claimed";
    return {
      id: page.id,
      name: page.name || "Untitled Page",
      picture: page.picture ?? null,
      instagramBusinessId: page.instagramBusinessId ?? null,
      state,
    };
  });
}

/** Step 2 of the Facebook flow: connect the chosen Pages using the user token from the picker session. */
export async function completeFacebookConnect(input: {
  workspaceId: string;
  userId: string;
  userToken: string;
  pageIds: string[];
}): Promise<ChannelSummary[]> {
  const { workspaceId, userId } = input;
  const pageIds = Array.from(new Set(input.pageIds));
  const pages = await listFacebookPages(input.userToken);
  const byId = new Map(pages.map((p) => [p.id, p]));
  const selected = pageIds.map((id) => byId.get(id)).filter((p): p is FacebookPageInfo => Boolean(p));
  if (selected.length !== pageIds.length) {
    throw new ApiError(422, "One or more selected Pages are no longer available on your Facebook account.", "PAGE_NOT_FOUND");
  }

  // Resolve claims and count slots before writing anything so a limit error leaves no half-connected state.
  let needed = 0;
  const existingByPage = new Map<string, Channel | null>();
  for (const page of selected) {
    const existing = await resolveClaim(workspaceId, ChannelPlatform.FACEBOOK, page.id);
    existingByPage.set(page.id, existing);
    if (!existing || existing.status === ChannelStatus.DISCONNECTED) needed++;
  }
  await assertChannelSlots(workspaceId, needed);

  const ids: string[] = [];
  for (const page of selected) {
    const data = {
      name: page.name || null,
      avatarUrl: page.picture ?? null,
      linkedInstagramId: page.instagramBusinessId ?? null,
      accessTokenEnc: encrypt(page.accessToken),
      // Page tokens minted from a long-lived user token don't expire; error 190 flips status instead.
      tokenExpiresAt: null,
      scopes: [...FACEBOOK_SCOPES],
      status: ChannelStatus.ACTIVE,
      lastError: null,
      connectedById: userId,
    };
    const channel = await prisma.channel.upsert({
      where: { platform_externalId: { platform: ChannelPlatform.FACEBOOK, externalId: page.id } },
      create: { workspaceId, platform: ChannelPlatform.FACEBOOK, externalId: page.id, ...data },
      update: data,
    });
    await subscribeWebhooks(channel, page.accessToken);
    await queueMediaSync(channel);
    const existed = Boolean(existingByPage.get(page.id));
    await recordAudit({
      workspaceId,
      userId,
      action: existed ? "channel.reconnected" : "channel.connected",
      targetType: "channel",
      targetId: channel.id,
      metadata: { platform: "FACEBOOK", externalId: page.id, name: page.name },
    });
    logger.info("channel.connected", { channelId: channel.id, workspaceId, platform: "FACEBOOK", reconnect: existed });
    ids.push(channel.id);
  }
  if (ids.length > 0) await markWorkspaceOnboarded(workspaceId);

  const summaries = await listChannels(workspaceId);
  return ids.map((id) => summaries.find((s) => s.id === id)).filter((s): s is ChannelSummary => Boolean(s));
}

/** Single-shot variant (no picker): connects `pageIds`, or every Page when omitted. */
export async function connectFacebookPages(input: {
  workspaceId: string;
  userId: string;
  code: string;
  redirectUri: string;
  pageIds?: string[];
}): Promise<ChannelSummary[]> {
  const { userToken, pages } = await beginFacebookConnect(input);
  if (pages.length === 0) {
    throw new ApiError(422, "No Page was shared. Connect again, choose Edit settings and tick your Page.", "NO_PAGES");
  }
  return completeFacebookConnect({
    workspaceId: input.workspaceId,
    userId: input.userId,
    userToken,
    pageIds: input.pageIds ?? pages.map((p) => p.id),
  });
}

// ───────────────────────── Disconnect ─────────────────────────

/** Best-effort: stop Meta pushing webhooks for a Page we no longer serve. Instagram Login has no equivalent edge. */
async function unsubscribeWebhooks(channel: Channel, token: string): Promise<void> {
  if (channel.platform !== ChannelPlatform.FACEBOOK) return;
  try {
    await metaFetch(graphUrl(GRAPH_FACEBOOK_HOST, `/${channel.externalId}/subscribed_apps`), { token, method: "DELETE" });
  } catch (err) {
    logger.info("channel.webhook_unsubscribe_failed", { channelId: channel.id, error: errorText(err) });
  }
}

/** Unsubscribe without ever throwing: a revoked or undecryptable token must not block a disconnect or purge. */
async function unsubscribeQuietly(channel: Channel): Promise<void> {
  if (channel.status === ChannelStatus.DISCONNECTED) return;
  try {
    await unsubscribeWebhooks(channel, getChannelToken(channel));
  } catch (err) {
    logger.warn("channel.disconnect_token_unreadable", { channelId: channel.id, error: errorText(err) });
  }
}

/**
 * Marks the channel DISCONNECTED and destroys the stored token. Contacts,
 * conversations, automations and logs are kept so reconnecting restores the
 * workspace exactly as it was.
 */
export async function disconnectChannel(workspaceId: string, id: string, actorId: string): Promise<ChannelSummary> {
  const channel = await requireChannel(workspaceId, id);
  if (channel.status === ChannelStatus.DISCONNECTED) return requireSummary(workspaceId, id);

  await unsubscribeQuietly(channel);

  await prisma.channel.update({
    where: { id },
    data: {
      status: ChannelStatus.DISCONNECTED,
      accessTokenEnc: encrypt(REVOKED_TOKEN),
      tokenExpiresAt: new Date(),
      webhookSubscribed: false,
      lastError: null,
    },
  });
  await recordAudit({
    workspaceId,
    userId: actorId,
    action: "channel.disconnected",
    targetType: "channel",
    targetId: id,
    metadata: { platform: channel.platform, externalId: channel.externalId },
  });
  logger.info("channel.disconnected", { channelId: id, workspaceId, actorId });
  return requireSummary(workspaceId, id);
}

// ───────────────────────── Purge (permanent) ─────────────────────────

/** What a purge removed, recorded in the audit log so the deletion is provable later. */
export type PurgeCounts = {
  media: number;
  automations: number;
  contacts: number;
  conversations: number;
  broadcasts: number;
  deliveryLogs: number;
  jobs: number;
  webhookReceipts: number;
};

const EMPTY_PURGE_COUNTS: Omit<PurgeCounts, "jobs" | "webhookReceipts"> = {
  media: 0,
  automations: 0,
  contacts: 0,
  conversations: 0,
  broadcasts: 0,
  deliveryLogs: 0,
};

/**
 * Raw webhook receipts (`WebhookEvent`) carry no channel foreign key: they
 * exist only to de-duplicate Meta redeliveries. Prisma can't LIKE-match
 * inside jsonb, so the envelopes are matched on their text form for every
 * id that could name this account: the account/Page id itself (message
 * sender/recipient, `page_id_post_id` composites) and each cached post id
 * (comment events reference the media, not the account). Best-effort: a
 * failure here is logged, never surfaced, because the tenant rows are gone.
 */
async function deleteWebhookReceipts(ids: string[]): Promise<number> {
  const patterns = ids.filter(Boolean).map((id) => `%${id.replace(/[%_\\]/g, "\\$&")}%`);
  if (patterns.length === 0) return 0;
  try {
    return await prisma.$executeRaw`DELETE FROM "WebhookEvent" WHERE "payload"::text LIKE ANY(${patterns}::text[])`;
  } catch (err) {
    logger.warn("channel.webhook_receipts_purge_failed", { error: errorText(err) });
    return 0;
  }
}

/**
 * Deletes the channel row and lets the schema cascade take media,
 * automations (+ flow sessions, tracked links), contacts (+ conversations,
 * messages), broadcasts, delivery logs and rate-limit windows with it.
 * Queued jobs that name the channel are dropped first so the worker never
 * wakes up to work on rows that no longer exist. Callers scope + audit.
 */
async function purgeChannelRows(channel: Channel): Promise<PurgeCounts> {
  const [row, media] = await Promise.all([
    prisma.channel.findUnique({
      where: { id: channel.id },
      select: {
        _count: { select: { media: true, automations: true, contacts: true, conversations: true, broadcasts: true, deliveryLogs: true } },
      },
    }),
    prisma.media.findMany({ where: { channelId: channel.id }, select: { externalId: true }, take: 500 }),
  ]);
  const counts = row?._count ?? EMPTY_PURGE_COUNTS;

  const [jobs] = await prisma.$transaction([
    prisma.job.deleteMany({
      where: {
        status: { in: [JobStatus.PENDING, JobStatus.FAILED] },
        payload: { path: ["channelId"], equals: channel.id },
      },
    }),
    prisma.channel.delete({ where: { id: channel.id } }),
  ]);

  const webhookReceipts = await deleteWebhookReceipts([channel.externalId, ...media.map((m) => m.externalId)]);
  return { ...counts, jobs: jobs.count, webhookReceipts };
}

/**
 * "Delete channel & data": the irreversible counterpart to `disconnectChannel`.
 * Everything the account ever produced in this workspace is removed (see
 * `purgeChannelRows`); only the audit entry describing the purge remains.
 * OWNER-only at the route.
 */
export async function purgeChannel(workspaceId: string, id: string, actorId: string): Promise<{ id: string; counts: PurgeCounts }> {
  const channel = await requireChannel(workspaceId, id);
  await unsubscribeQuietly(channel);
  const counts = await purgeChannelRows(channel);
  await recordAudit({
    workspaceId,
    userId: actorId,
    action: "channel.purged",
    targetType: "channel",
    targetId: id,
    metadata: { platform: channel.platform, externalId: channel.externalId, username: channel.username, ...counts },
  });
  logger.info("channel.purged", { channelId: id, workspaceId, actorId, platform: channel.platform, ...counts });
  return { id, counts };
}

// ───────────────────────── Media cache ─────────────────────────

async function fetchInstagramMediaRows(token: string, igUserId: string): Promise<MediaRow[]> {
  const rows: MediaRow[] = [];
  let after: string | undefined;
  for (let page = 0; page < MEDIA_SYNC_PAGES; page++) {
    const { items, nextCursor } = await listInstagramMedia(token, igUserId, { limit: MEDIA_SYNC_PAGE_SIZE, after });
    for (const m of items) {
      rows.push({
        externalId: m.id,
        caption: m.caption ?? null,
        mediaType: m.mediaType ?? null,
        mediaUrl: m.mediaUrl ?? null,
        // Videos/reels only expose `thumbnail_url`; images use `media_url` for both.
        thumbnailUrl: m.thumbnailUrl ?? m.mediaUrl ?? null,
        permalink: m.permalink ?? null,
        timestamp: m.timestamp ?? null,
        commentCount: m.commentsCount ?? null,
        likeCount: m.likeCount ?? null,
      });
    }
    if (!nextCursor) break;
    after = nextCursor;
  }
  return rows;
}

async function fetchFacebookPostRows(token: string, pageId: string): Promise<MediaRow[]> {
  const posts = await listFacebookPosts(token, pageId, { limit: MEDIA_SYNC_PAGE_SIZE });
  return posts.map((p) => ({
    externalId: p.id,
    caption: p.message ?? null,
    mediaType: "POST",
    mediaUrl: p.fullPicture ?? null,
    thumbnailUrl: p.fullPicture ?? null,
    permalink: p.permalinkUrl ?? null,
    timestamp: p.createdTime ?? null,
    commentCount: p.commentCount ?? null,
    likeCount: null,
  }));
}

/**
 * Refreshes the cached Media rows for the post picker. Called by the
 * SYNC_MEDIA job handler (unscoped: the job carries a trusted channel id)
 * and inline by refresh/`?refresh=1`. Token errors flag the channel and
 * return; anything else propagates so the queue retries with backoff.
 */
export async function syncChannelMedia(channelId: string): Promise<void> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) {
    logger.warn("channel.sync_media_missing", { channelId });
    return;
  }
  if (channel.status === ChannelStatus.DISCONNECTED) return;

  let rows: MediaRow[];
  try {
    const token = getChannelToken(channel);
    rows =
      channel.platform === ChannelPlatform.INSTAGRAM
        ? await fetchInstagramMediaRows(token, channel.externalId)
        : await fetchFacebookPostRows(token, channel.externalId);
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(channel.id, err.message);
      return;
    }
    const message = errorText(err);
    await prisma.channel.update({ where: { id: channelId }, data: { lastError: `Media sync failed: ${message}`.slice(0, 500) } });
    throw err;
  }

  const syncedAt = new Date();
  await prisma.$transaction([
    ...rows.map((row) =>
      prisma.media.upsert({
        where: { channelId_externalId: { channelId, externalId: row.externalId } },
        create: { channelId, ...row, syncedAt },
        update: { ...row, syncedAt },
      }),
    ),
    prisma.channel.update({ where: { id: channelId }, data: { lastSyncedAt: syncedAt } }),
  ]);
  logger.info("channel.media_synced", { channelId, platform: channel.platform, count: rows.length });
}

/**
 * Cached media for the post picker. `refresh` forces a sync first; a channel
 * that has never synced is synced inline so the first open isn't empty.
 */
export async function listChannelMedia(
  workspaceId: string,
  channelId: string,
  opts: { q?: string; limit?: number; refresh?: boolean } = {},
): Promise<{ media: MediaSummary[]; syncedAt: string | null }> {
  const channel = await requireChannel(workspaceId, channelId);

  if (opts.refresh || !channel.lastSyncedAt) {
    try {
      await syncChannelMedia(channel.id);
    } catch (err) {
      // An explicit refresh should surface the failure; a lazy first sync just falls back to whatever is cached.
      if (opts.refresh) {
        if (err instanceof MetaApiError) throw new ApiError(502, `Meta couldn't load posts: ${err.message}`, "META_ERROR");
        throw err;
      }
      logger.warn("channel.media_initial_sync_failed", { channelId: channel.id, error: errorText(err) });
    }
  }

  const q = opts.q?.trim();
  const take = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const [rows, fresh] = await Promise.all([
    prisma.media.findMany({
      where: { channelId: channel.id, ...(q ? { caption: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: [{ timestamp: { sort: "desc", nulls: "last" } }, { syncedAt: "desc" }],
      take,
    }),
    prisma.channel.findUnique({ where: { id: channel.id }, select: { lastSyncedAt: true } }),
  ]);
  return { media: rows.map(toMediaSummary), syncedAt: fresh?.lastSyncedAt?.toISOString() ?? null };
}

// ───────────────────────── Refresh ─────────────────────────

type RawPageInfo = {
  id: string;
  name?: string;
  picture?: { data?: { url?: string } };
  followers_count?: number;
  fan_count?: number;
  instagram_business_account?: { id?: string | number };
};

/** lib/meta/facebook has no single-Page read, so this lane carries the one field set it needs. */
async function fetchFacebookPageProfile(pageToken: string, pageId: string) {
  const res = await metaFetch<RawPageInfo>(
    graphUrl(GRAPH_FACEBOOK_HOST, `/${pageId}`, { fields: "id,name,picture{url},followers_count,fan_count,instagram_business_account" }),
    { token: pageToken },
  );
  return {
    name: res.name ?? null,
    avatarUrl: res.picture?.data?.url ?? null,
    followerCount: res.followers_count ?? res.fan_count ?? null,
    linkedInstagramId: res.instagram_business_account?.id !== undefined ? String(res.instagram_business_account.id) : null,
  };
}

async function fetchInstagramProfile(token: string) {
  const me = await getInstagramMe(token);
  return {
    username: me.username || null,
    name: me.name ?? null,
    avatarUrl: me.profilePictureUrl ?? null,
    followerCount: me.followersCount ?? null,
  };
}

/**
 * Re-reads the account profile (name, avatar, follower count), retries the
 * webhook subscription if it never confirmed, and re-syncs media. A working
 * token also clears an earlier TOKEN_EXPIRED/ERROR status.
 */
export async function refreshChannel(workspaceId: string, id: string): Promise<ChannelSummary> {
  const channel = await requireChannel(workspaceId, id);
  if (channel.status === ChannelStatus.DISCONNECTED) {
    throw new ApiError(409, "This channel is disconnected. Reconnect it to refresh.", "CHANNEL_DISCONNECTED");
  }

  let token: string;
  try {
    token = getChannelToken(channel);
  } catch (err) {
    logger.error("channel.token_unreadable", { channelId: id, error: errorText(err) });
    throw new ApiError(409, "The stored token can't be read. Reconnect the account.", "TOKEN_UNREADABLE");
  }

  try {
    const profile =
      channel.platform === ChannelPlatform.INSTAGRAM
        ? await fetchInstagramProfile(token)
        : await fetchFacebookPageProfile(token, channel.externalId);
    await prisma.channel.update({ where: { id }, data: { ...profile, status: ChannelStatus.ACTIVE, lastError: null } });
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(id, err.message);
      throw new ApiError(409, "The access token for this account has expired. Reconnect it to continue.", "TOKEN_EXPIRED");
    }
    if (err instanceof MetaApiError) {
      await prisma.channel.update({ where: { id }, data: { lastError: `Refresh failed: ${err.message}`.slice(0, 500) } });
      throw new ApiError(502, `Meta returned an error: ${err.message}`, "META_ERROR");
    }
    throw err;
  }

  if (!channel.webhookSubscribed) await subscribeWebhooks(channel, token);

  try {
    await syncChannelMedia(id);
  } catch (err) {
    // Profile refresh already succeeded; a media hiccup is recorded on the channel, not thrown at the user.
    logger.warn("channel.refresh_media_failed", { channelId: id, error: errorText(err) });
  }

  logger.info("channel.refreshed", { channelId: id, workspaceId });
  return requireSummary(workspaceId, id);
}

// ───────────────────────── Meta callbacks (no session) ─────────────────────────

/**
 * Channels Meta's `user_id` could refer to. For Instagram Login this is the
 * professional account id we store as `externalId`; for a Facebook Page
 * with a linked Instagram account it may be `linkedInstagramId`. Facebook
 * *person* ids aren't stored (only Page ids are), so a Facebook
 * deauthorization by a person can't be mapped: the Page token simply fails
 * with error 190 on next use and flips to TOKEN_EXPIRED.
 */
function channelsForMetaUser(metaUserId: string, includeDisconnected: boolean) {
  return prisma.channel.findMany({
    where: {
      OR: [{ externalId: metaUserId }, { linkedInstagramId: metaUserId }],
      ...(includeDisconnected ? {} : { status: { not: ChannelStatus.DISCONNECTED } }),
    },
  });
}

async function revokeChannels(channels: Channel[], reason: string, action: string): Promise<void> {
  for (const channel of channels) {
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        status: ChannelStatus.DISCONNECTED,
        accessTokenEnc: encrypt(REVOKED_TOKEN),
        tokenExpiresAt: new Date(),
        webhookSubscribed: false,
        lastError: reason,
      },
    });
    await recordAudit({
      workspaceId: channel.workspaceId,
      action,
      targetType: "channel",
      targetId: channel.id,
      metadata: { platform: channel.platform, externalId: channel.externalId },
    });
  }
}

/** Meta "Deauthorize callback": the user removed the app on Meta's side. */
export async function handleMetaDeauthorize(metaUserId: string): Promise<{ channelIds: string[] }> {
  const channels = await channelsForMetaUser(metaUserId, false);
  await revokeChannels(channels, "Access was removed from Instagram/Facebook settings", "channel.deauthorized");
  logger.info("meta.deauthorize", { metaUserId, channels: channels.length });
  return { channelIds: channels.map((c) => c.id) };
}

const DATA_DELETION_AUDIT_ACTION = "meta.data_deletion";

/**
 * Meta "Data deletion request callback". The id identifies the *business*
 * user who authorized us, so every channel it maps to is purged outright:
 * the same full cascade as "Delete channel & data": in whichever workspace
 * holds it. The confirmation code Meta shows the user is stored on the
 * global audit row so a request can be traced from the code alone.
 */
export async function handleMetaDataDeletion(metaUserId: string): Promise<{ confirmationCode: string; channelIds: string[] }> {
  const confirmationCode = randomToken(9);
  const channels = await channelsForMetaUser(metaUserId, true);
  const channelIds: string[] = [];
  const workspaceIds = new Set<string>();

  for (const channel of channels) {
    await unsubscribeQuietly(channel);
    const counts = await purgeChannelRows(channel);
    channelIds.push(channel.id);
    workspaceIds.add(channel.workspaceId);
    await recordAudit({
      workspaceId: channel.workspaceId,
      action: "channel.data_deletion",
      targetType: "channel",
      targetId: channel.id,
      metadata: { platform: channel.platform, externalId: channel.externalId, confirmationCode, ...counts },
    });
  }

  await recordAudit({
    workspaceId: null,
    action: DATA_DELETION_AUDIT_ACTION,
    targetType: "meta_user",
    targetId: metaUserId,
    metadata: { confirmationCode, channelIds, workspaceIds: [...workspaceIds] },
  });
  logger.info("meta.data_deletion", { metaUserId, confirmationCode, channels: channelIds.length });
  return { confirmationCode, channelIds };
}
