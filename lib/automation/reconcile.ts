/**
 * Polling safety net for missed comment webhooks. Every COMMENT_POLL_INTERVAL
 * the worker (or the cron route) enqueues RECONCILE_COMMENTS per channel that
 * has an ACTIVE comment automation; we pull recent comments from Meta and feed
 * the ones the webhook never delivered through the same engine path.
 *
 * Polling spends the same per-account Meta budget as private replies, so it
 * is kept cheap: paging stops once comments are older than any automation
 * needs, and a channel stops polling for a while when Meta says the app is
 * close to its limit.
 */
import { AutomationStatus, ChannelPlatform, ChannelStatus, JobType, TriggerType, type Channel, type Job } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { META_USAGE_HIGH_PERCENT } from "@/lib/meta/client";
import { getFacebookPostComments } from "@/lib/meta/facebook";
import { getInstagramMediaComments } from "@/lib/meta/instagram";
import { getChannelToken, markChannelTokenExpired } from "@/lib/meta/tokens";
import { MetaApiError, MetaRateLimitError, MetaTokenError, type NormalizedCommentEvent, type PlatformComment } from "@/lib/meta/types";
import { webhookDedupeKey } from "@/lib/meta/webhook";
import { enqueue } from "@/lib/queue";
import { syncChannelMedia } from "@/lib/services/channels";
import { claimWebhookEvent, completeWebhookEvent, recordWebhookEvent, releaseWebhookEvent } from "@/lib/webhooks/events";
import { handleIncomingEvent } from "./engine";

export const RECONCILE_LOOKBACK_MS = 72 * 3600 * 1000;
export const RECONCILE_MAX_COMMENTS_PER_AUTOMATION = 200;
export const RECONCILE_RECENT_MEDIA_COUNT = 10;
/**
 * "All posts" automations poll the newest cached posts. Outside reconcile the
 * cache only fills on connect or a manual refresh, so it is refreshed here
 * once it is this old: otherwise a post published since would never be polled.
 */
export const RECONCILE_MEDIA_MAX_AGE_MS = 6 * 3600 * 1000;
/** How long a channel stops polling once Meta says the app is near its limit, leaving the rest to private replies. */
export const RECONCILE_BACKOFF_MS = 30 * 60_000;

export const reconcilePayloadSchema = z.object({ channelId: z.string().min(1) });

/**
 * `media`: posts whose comments were read. `failed`: comments the engine
 * could not handle, plus posts whose comments could not be read.
 */
export type ReconcileResult = { media: number; fetched: number; fed: number; skipped: number; failed: number };

type FeedOutcome = "fed" | "skipped" | "failed";

type PauseReason = { cause: "usage_high"; usage: number } | { cause: "rate_limited"; code?: number };

export async function reconcileChannel(job: Job): Promise<void> {
  const parsed = reconcilePayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("reconcile.bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  await reconcileChannelById(parsed.data.channelId);
}

function isPaused(channel: Pick<Channel, "pollBackoffUntil">, now = Date.now()): boolean {
  return channel.pollBackoffUntil !== null && channel.pollBackoffUntil.getTime() > now;
}

/**
 * Stops polling on the channel for RECONCILE_BACKOFF_MS. A channel already
 * paused is left as it is, so each pause is logged once.
 */
async function pausePolling(channelId: string, reason: PauseReason): Promise<void> {
  const now = new Date();
  const until = new Date(now.getTime() + RECONCILE_BACKOFF_MS);
  const res = await prisma.channel.updateMany({
    where: { id: channelId, OR: [{ pollBackoffUntil: null }, { pollBackoffUntil: { lte: now } }] },
    data: { pollBackoffUntil: until },
  });
  if (res.count > 0) logger.warn("reconcile.paused", { channelId, until: until.toISOString(), ...reason });
}

/**
 * The newest cached posts, which "all posts" automations poll. A cache older
 * than RECONCILE_MEDIA_MAX_AGE_MS (or never filled) is refreshed first; when
 * that fails the posts already cached are polled, and the refresh is tried
 * again on the next run. Null when the refresh found the account signed out.
 */
async function recentMediaIds(channel: Channel): Promise<string[] | null> {
  const age = channel.lastSyncedAt ? Date.now() - channel.lastSyncedAt.getTime() : Number.POSITIVE_INFINITY;
  if (age > RECONCILE_MEDIA_MAX_AGE_MS) {
    try {
      await syncChannelMedia(channel.id);
    } catch (err) {
      if (err instanceof MetaRateLimitError) throw err;
      logger.warn("reconcile.media_sync_failed", { channelId: channel.id, error: err instanceof Error ? err.message : String(err) });
    }
    // A dead token doesn't throw out of the sync: it flags the channel instead.
    const current = await prisma.channel.findUnique({ where: { id: channel.id }, select: { status: true } });
    if (current?.status !== ChannelStatus.ACTIVE) return null;
  }
  const rows = await prisma.media.findMany({
    where: { channelId: channel.id },
    orderBy: [{ timestamp: { sort: "desc", nulls: "last" } }, { syncedAt: "desc" }],
    take: RECONCILE_RECENT_MEDIA_COUNT,
    select: { externalId: true },
  });
  return rows.map((r) => r.externalId);
}

function toEvent(channel: Channel, mediaId: string, comment: PlatformComment): NormalizedCommentEvent {
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
 * Runs one comment through the engine under the webhook's own event row. The
 * row is stored, then claimed: the claim is a short lease the webhook job
 * takes too, so the two never handle one comment at the same time. A comment
 * already processed, or being processed right now, is skipped.
 */
async function feedEvent(channel: Channel, event: NormalizedCommentEvent): Promise<FeedOutcome> {
  const { dedupeKey, processed } = await recordWebhookEvent(event, "reconcile");
  if (processed) return "skipped";
  if (!(await claimWebhookEvent(dedupeKey))) return "skipped";
  try {
    await handleIncomingEvent(channel, event);
    await completeWebhookEvent(dedupeKey);
    return "fed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Let go of it, so the next run (or the webhook job) can try again.
    await releaseWebhookEvent(dedupeKey, message);
    logger.error("reconcile.event_error", { channelId: channel.id, dedupeKey, error: message });
    return "failed";
  }
}

export async function reconcileChannelById(channelId: string): Promise<ReconcileResult> {
  const result: ReconcileResult = { media: 0, fetched: 0, fed: 0, skipped: 0, failed: 0 };
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  // Paused channels are not queued, but a job queued just before the pause still lands here.
  if (!channel || channel.status !== ChannelStatus.ACTIVE || isPaused(channel)) return result;

  const automations = await prisma.automation.findMany({
    where: { channelId: channel.id, workspaceId: channel.workspaceId, status: AutomationStatus.ACTIVE, triggerType: TriggerType.COMMENT },
  });
  if (automations.length === 0) return result;

  const token = getChannelToken(channel);
  const now = Date.now();
  // The highest usage Meta reported on this run's calls.
  let usage = 0;
  const onUsage = (percent: number) => {
    usage = Math.max(usage, percent);
  };

  // One fetch per media, using the earliest `since` any automation needs.
  const plan = new Map<string, { since: Date; automationIds: string[] }>();
  let recent: string[] | null | undefined;
  try {
    for (const automation of automations) {
      const since = new Date(Math.max(now - RECONCILE_LOOKBACK_MS, automation.createdAt.getTime()));
      let mediaIds = automation.mediaIds;
      if (mediaIds.length === 0) {
        if (recent === undefined) recent = await recentMediaIds(channel);
        if (recent === null) return result;
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
    if (err instanceof MetaRateLimitError) {
      await pausePolling(channel.id, { cause: "rate_limited", code: err.code });
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
      const opts = { since, limit: RECONCILE_MAX_COMMENTS_PER_AUTOMATION, onUsage };
      comments =
        channel.platform === ChannelPlatform.INSTAGRAM
          ? await getInstagramMediaComments(token, mediaId, opts)
          : await getFacebookPostComments(token, mediaId, opts);
    } catch (err) {
      if (err instanceof MetaTokenError) {
        await markChannelTokenExpired(channel.id, err.message);
        break;
      }
      if (err instanceof MetaRateLimitError) {
        await pausePolling(channel.id, { cause: "rate_limited", code: err.code });
        break;
      }
      if (err instanceof MetaApiError && !err.retryable) {
        // Deleted media, permission changes… skip this one and keep going.
        logger.warn("reconcile.media_error", { channelId: channel.id, mediaId, code: err.code, message: err.message });
        result.failed++;
        continue;
      }
      throw err;
    }
    result.media++;
    result.fetched += comments.length;

    if (comments.length > 0) {
      const events = comments.map((c) => toEvent(channel, mediaId, c));
      // Most of them came in by webhook already: one query rules those out instead of a claim each.
      const seenRows = await prisma.webhookEvent.findMany({
        where: { dedupeKey: { in: events.map(webhookDedupeKey) }, processed: true },
        select: { dedupeKey: true },
      });
      const seen = new Set(seenRows.map((r) => r.dedupeKey));

      for (const event of events) {
        if (seen.has(webhookDedupeKey(event))) {
          result.skipped++;
          continue;
        }
        if (!hasBudget(automationIds)) break;
        const outcome = await feedEvent(channel, event);
        result[outcome]++;
        if (outcome !== "skipped") for (const id of automationIds) budget.set(id, (budget.get(id) ?? 0) - 1);
      }
    }

    if (usage >= META_USAGE_HIGH_PERCENT) {
      // What was read is fed; the other posts wait until the pause is over.
      await pausePolling(channel.id, { cause: "usage_high", usage });
      break;
    }
  }

  // Channel.lastSyncedAt is not touched here: it says when the Media cache was
  // filled, and a poll is not a sync (see syncChannelMedia).
  const summary = { channelId: channel.id, ...result, planned: plan.size };
  if (result.fed > 0 || result.failed > 0) logger.info("reconcile.done", summary);
  else logger.debug("reconcile.done", summary);
  return result;
}

/**
 * Queue one RECONCILE_COMMENTS per ACTIVE channel that has an active comment
 * automation and is not paused. The dedupe key is bucketed by poll interval
 * so the worker and the cron route can both call this without stacking
 * duplicates.
 */
export async function enqueueReconcileJobs(intervalMs?: number): Promise<number> {
  const interval = intervalMs ?? optionalEnv("COMMENT_POLL_INTERVAL_MS") ?? 15 * 60_000;
  const now = new Date();
  const channels = await prisma.channel.findMany({
    where: {
      status: ChannelStatus.ACTIVE,
      OR: [{ pollBackoffUntil: null }, { pollBackoffUntil: { lte: now } }],
      automations: { some: { status: AutomationStatus.ACTIVE, triggerType: TriggerType.COMMENT } },
    },
    select: { id: true, workspaceId: true },
  });
  const bucket = Math.floor(now.getTime() / interval);
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
