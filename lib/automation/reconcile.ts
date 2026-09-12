/**
 * Polling safety net for missed comment webhooks. Every COMMENT_POLL_INTERVAL
 * the worker (or the cron route) enqueues RECONCILE_COMMENTS per channel that
 * has an ACTIVE comment automation; we pull recent comments from Meta and feed
 * the ones the webhook never delivered through the same engine path.
 */
import { AutomationStatus, ChannelPlatform, ChannelStatus, JobType, Prisma, TriggerType, type Channel, type Job } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getFacebookPostComments, listFacebookPosts } from "@/lib/meta/facebook";
import { getInstagramMediaComments, listInstagramMedia } from "@/lib/meta/instagram";
import { getChannelToken, markChannelTokenExpired } from "@/lib/meta/tokens";
import { MetaApiError, MetaRateLimitError, MetaTokenError, type NormalizedEvent, type PlatformComment } from "@/lib/meta/types";
import { webhookDedupeKey } from "@/lib/meta/webhook";
import { enqueue } from "@/lib/queue";
import { handleIncomingEvent } from "./engine";

export const RECONCILE_LOOKBACK_MS = 72 * 3600 * 1000;
export const RECONCILE_MAX_COMMENTS_PER_AUTOMATION = 200;
export const RECONCILE_RECENT_MEDIA_COUNT = 10;

export const reconcilePayloadSchema = z.object({ channelId: z.string().min(1) });

export type ReconcileResult = { fetched: number; fed: number; skipped: number };

export async function reconcileChannel(job: Job): Promise<void> {
  const parsed = reconcilePayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("reconcile.bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  await reconcileChannelById(parsed.data.channelId);
}

/** Cached Media rows first; a freshly connected channel without a sync falls back to the API. */
async function recentMediaIds(channel: Channel, token: string): Promise<string[]> {
  const rows = await prisma.media.findMany({
    where: { channelId: channel.id },
    orderBy: [{ timestamp: { sort: "desc", nulls: "last" } }, { syncedAt: "desc" }],
    take: RECONCILE_RECENT_MEDIA_COUNT,
    select: { externalId: true },
  });
  if (rows.length > 0) return rows.map((r) => r.externalId);
  if (channel.platform === ChannelPlatform.INSTAGRAM) {
    const { items } = await listInstagramMedia(token, channel.externalId, { limit: RECONCILE_RECENT_MEDIA_COUNT });
    return items.map((m) => m.id);
  }
  const posts = await listFacebookPosts(token, channel.externalId, { limit: RECONCILE_RECENT_MEDIA_COUNT });
  return posts.map((p) => p.id);
}

function toEvent(channel: Channel, mediaId: string, comment: PlatformComment): NormalizedEvent {
  return {
    kind: "comment",
    platform: channel.platform,
    channelExternalId: channel.externalId,
    commentId: comment.id,
    mediaId,
    parentCommentId: comment.parentId,
    text: comment.text,
    from: { id: comment.from?.id ?? "", username: comment.from?.username ?? comment.from?.name },
    timestamp: comment.timestamp,
    raw: { source: "reconcile", comment: { ...comment, timestamp: comment.timestamp.toISOString() } },
  };
}

/**
 * Run the event through the engine and record a WebhookEvent under the same
 * dedupe key the real webhook would use, so neither path processes it twice.
 */
async function feedEvent(channel: Channel, event: NormalizedEvent): Promise<void> {
  const dedupeKey = webhookDedupeKey(event);
  await prisma.webhookEvent.upsert({
    where: { dedupeKey },
    create: { platform: channel.platform, dedupeKey, field: "reconcile", payload: event.raw as Prisma.InputJsonValue, processed: false },
    update: {},
  });
  try {
    await handleIncomingEvent(channel, event);
    await prisma.webhookEvent.update({ where: { dedupeKey }, data: { processed: true, error: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.webhookEvent.update({ where: { dedupeKey }, data: { processed: false, error: message.slice(0, 1000) } });
    logger.error("reconcile.event_error", { channelId: channel.id, dedupeKey, error: message });
  }
}

export async function reconcileChannelById(channelId: string): Promise<ReconcileResult> {
  const result: ReconcileResult = { fetched: 0, fed: 0, skipped: 0 };
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.status !== ChannelStatus.ACTIVE) return result;

  const automations = await prisma.automation.findMany({
    where: { channelId: channel.id, workspaceId: channel.workspaceId, status: AutomationStatus.ACTIVE, triggerType: TriggerType.COMMENT },
  });
  if (automations.length === 0) return result;

  const token = getChannelToken(channel);
  const now = Date.now();

  // One fetch per media, using the earliest `since` any automation needs.
  const plan = new Map<string, { since: Date; automationIds: string[] }>();
  let recent: string[] | null = null;
  try {
    for (const automation of automations) {
      const since = new Date(Math.max(now - RECONCILE_LOOKBACK_MS, automation.createdAt.getTime()));
      let mediaIds = automation.mediaIds;
      if (mediaIds.length === 0) {
        recent ??= await recentMediaIds(channel, token);
        mediaIds = recent;
      }
      for (const mediaId of mediaIds) {
        const entry = plan.get(mediaId);
        if (!entry) plan.set(mediaId, { since, automationIds: [automation.id] });
        else {
          if (since < entry.since) entry.since = since;
          entry.automationIds.push(automation.id);
        }
      }
    }
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(channel.id, err.message);
      return result;
    }
    throw err;
  }

  const budget = new Map<string, number>(automations.map((a) => [a.id, RECONCILE_MAX_COMMENTS_PER_AUTOMATION]));
  const hasBudget = (ids: string[]) => ids.some((id) => (budget.get(id) ?? 0) > 0);

  for (const [mediaId, { since, automationIds }] of plan) {
    if (!hasBudget(automationIds)) continue;

    let comments: PlatformComment[];
    try {
      comments =
        channel.platform === ChannelPlatform.INSTAGRAM
          ? await getInstagramMediaComments(token, mediaId, { since, limit: RECONCILE_MAX_COMMENTS_PER_AUTOMATION })
          : await getFacebookPostComments(token, mediaId, { since, limit: RECONCILE_MAX_COMMENTS_PER_AUTOMATION });
    } catch (err) {
      if (err instanceof MetaTokenError) {
        await markChannelTokenExpired(channel.id, err.message);
        return result;
      }
      if (err instanceof MetaRateLimitError) {
        logger.warn("reconcile.rate_limited", { channelId: channel.id, mediaId });
        break;
      }
      if (err instanceof MetaApiError && !err.retryable) {
        // Deleted media, permission changes… skip this one and keep going.
        logger.warn("reconcile.media_error", { channelId: channel.id, mediaId, code: err.code, message: err.message });
        continue;
      }
      throw err;
    }
    result.fetched += comments.length;
    if (comments.length === 0) continue;

    const keys = comments.map((c) => `${channel.platform}:comment:${c.id}`);
    const seenRows = await prisma.webhookEvent.findMany({ where: { dedupeKey: { in: keys }, processed: true }, select: { dedupeKey: true } });
    const seen = new Set(seenRows.map((r) => r.dedupeKey));

    for (const comment of comments) {
      if (seen.has(`${channel.platform}:comment:${comment.id}`)) {
        result.skipped++;
        continue;
      }
      if (!hasBudget(automationIds)) break;
      await feedEvent(channel, toEvent(channel, mediaId, comment));
      result.fed++;
      for (const id of automationIds) budget.set(id, (budget.get(id) ?? 0) - 1);
    }
  }

  await prisma.channel.update({ where: { id: channel.id }, data: { lastSyncedAt: new Date() } });
  logger.info("reconcile.done", { channelId: channel.id, ...result, media: plan.size });
  return result;
}

/**
 * Queue one RECONCILE_COMMENTS per ACTIVE channel that has an active comment
 * automation. The dedupe key is bucketed by poll interval so the worker and
 * the cron route can both call this without stacking duplicates.
 */
export async function enqueueReconcileJobs(intervalMs?: number): Promise<number> {
  const interval = intervalMs ?? optionalEnv("COMMENT_POLL_INTERVAL_MS") ?? 5 * 60_000;
  const channels = await prisma.channel.findMany({
    where: { status: ChannelStatus.ACTIVE, automations: { some: { status: AutomationStatus.ACTIVE, triggerType: TriggerType.COMMENT } } },
    select: { id: true, workspaceId: true },
  });
  const bucket = Math.floor(Date.now() / interval);
  let count = 0;
  for (const channel of channels) {
    const job = await enqueue({
      type: JobType.RECONCILE_COMMENTS,
      workspaceId: channel.workspaceId,
      payload: { channelId: channel.id },
      dedupeKey: `reconcile:${channel.id}:${bucket}`,
      maxAttempts: 2,
    });
    if (job) count++;
  }
  return count;
}
