import { ChannelPlatform, ChannelStatus, type Channel } from "@prisma/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { enqueue } from "@/lib/queue";
import { GRAPH_FACEBOOK_HOST, graphUrl, metaFetch } from "./client";
import { refreshInstagramToken } from "./instagram";
import { MetaTokenError } from "./types";

/** Refresh IG long-lived tokens when fewer than this many days remain. */
export const TOKEN_REFRESH_WINDOW_DAYS = 10;
const DAY_MS = 24 * 3600 * 1000;

export function getChannelToken(channel: Pick<Channel, "accessTokenEnc">): string {
  return decrypt(channel.accessTokenEnc);
}

export async function storeChannelToken(channelId: string, token: string, expiresAt?: Date | null): Promise<void> {
  await prisma.channel.update({
    where: { id: channelId },
    data: {
      accessTokenEnc: encrypt(token),
      tokenExpiresAt: expiresAt ?? null,
      status: ChannelStatus.ACTIVE,
      lastError: null,
    },
  });
}

/** Called wherever Meta answers 190/102: the user must reconnect the channel. */
export async function markChannelTokenExpired(channelId: string, error?: string): Promise<void> {
  await prisma.channel.updateMany({
    where: { id: channelId, status: { not: ChannelStatus.DISCONNECTED } },
    data: { status: ChannelStatus.TOKEN_EXPIRED, lastError: error?.slice(0, 500) ?? "Access token expired or invalid" },
  });
  logger.warn("channel.token_expired", { channelId, error });
}

export type TokenRefreshResult = { refreshed: boolean; expiresAt: Date | null; reason?: string };

/**
 * Instagram: refresh the long-lived token when < 10 days remain (Meta requires
 * the token to be ≥ 24h old, so freshly issued tokens are left alone).
 * Facebook: page tokens don't expire; we only validate them and flag
 * invalidated ones as TOKEN_EXPIRED.
 */
export async function refreshChannelTokenIfNeeded(channel: Channel, opts: { force?: boolean } = {}): Promise<TokenRefreshResult> {
  if (channel.status === ChannelStatus.DISCONNECTED) return { refreshed: false, expiresAt: channel.tokenExpiresAt, reason: "disconnected" };
  const token = getChannelToken(channel);
  const now = Date.now();

  if (channel.platform === ChannelPlatform.FACEBOOK) {
    try {
      await metaFetch<{ id: string }>(graphUrl(GRAPH_FACEBOOK_HOST, "/me", { fields: "id" }), { token });
      return { refreshed: false, expiresAt: null, reason: "facebook_page_token_valid" };
    } catch (err) {
      if (err instanceof MetaTokenError) {
        await markChannelTokenExpired(channel.id, err.message);
        return { refreshed: false, expiresAt: null, reason: "token_invalid" };
      }
      throw err;
    }
  }

  const expiresAt = channel.tokenExpiresAt?.getTime() ?? null;
  const remainingMs = expiresAt === null ? null : expiresAt - now;
  const needsRefresh = opts.force || remainingMs === null || remainingMs < TOKEN_REFRESH_WINDOW_DAYS * DAY_MS;
  if (!needsRefresh) return { refreshed: false, expiresAt: channel.tokenExpiresAt, reason: "not_due" };

  // Tokens younger than 24h can't be refreshed; a fresh 60-day token has ~59d left, so this only trips on `force`.
  const ageMs = expiresAt === null ? Number.POSITIVE_INFINITY : 60 * DAY_MS - (expiresAt - now);
  if (ageMs < DAY_MS) return { refreshed: false, expiresAt: channel.tokenExpiresAt, reason: "too_young" };

  try {
    const refreshed = await refreshInstagramToken(token);
    const newExpiry = new Date(now + refreshed.expiresIn * 1000);
    await storeChannelToken(channel.id, refreshed.accessToken, newExpiry);
    logger.info("channel.token_refreshed", { channelId: channel.id, expiresAt: newExpiry.toISOString() });
    return { refreshed: true, expiresAt: newExpiry };
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(channel.id, err.message);
      return { refreshed: false, expiresAt: channel.tokenExpiresAt, reason: "token_invalid" };
    }
    throw err;
  }
}

/** Instagram channels whose token expires within `withinDays` (or has an unknown expiry). */
export function findChannelsNeedingRefresh(withinDays = TOKEN_REFRESH_WINDOW_DAYS): Promise<Channel[]> {
  const cutoff = new Date(Date.now() + withinDays * DAY_MS);
  return prisma.channel.findMany({
    where: {
      platform: ChannelPlatform.INSTAGRAM,
      status: { in: [ChannelStatus.ACTIVE, ChannelStatus.ERROR] },
      OR: [{ tokenExpiresAt: null }, { tokenExpiresAt: { lte: cutoff } }],
    },
    orderBy: { tokenExpiresAt: "asc" },
  });
}

/** Queue a REFRESH_TOKEN job per expiring channel (one per channel per day). Returns the number enqueued. */
export async function enqueueTokenRefreshes(withinDays = TOKEN_REFRESH_WINDOW_DAYS): Promise<number> {
  const channels = await findChannelsNeedingRefresh(withinDays);
  const day = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const channel of channels) {
    const job = await enqueue({
      type: "REFRESH_TOKEN",
      workspaceId: channel.workspaceId,
      payload: { channelId: channel.id },
      dedupeKey: `refresh:${channel.id}:${day}`,
      maxAttempts: 3,
    });
    if (job) count++;
  }
  return count;
}
