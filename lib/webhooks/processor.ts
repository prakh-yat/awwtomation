/**
 * Webhook ingestion, in two halves.
 *
 * `acceptWebhookBody` runs inside the request. It verifies the signature,
 * normalizes the body and stores each event worth acting on (comments,
 * messages, button taps; read receipts and everything else are dropped
 * unstored), then queues a PROCESS_WEBHOOK job for every one not yet
 * processed. That is all Meta waits for. The route runs those jobs straight
 * after answering; whatever it does not get to, the worker or the cron tick
 * picks up.
 *
 * `processWebhookJob` handles one stored event: it takes the event's lease,
 * finds the account and hands the event to the engine. A failure lets go of
 * the lease and throws, so the queue tries again with backoff. Nothing else
 * would: Meta never sends an event again once we have answered 200. A comment
 * for an account that needs reconnecting is let go without a retry, and the
 * reconcile poll picks it up once the account is back.
 */
import { ChannelStatus, JobType, type Job } from "@prisma/client";
import { z } from "zod";

import { handleIncomingEvent } from "@/lib/automation/engine";
import { prisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { NormalizedEvent } from "@/lib/meta/types";
import { normalizeWebhookPayload, verifyMetaSignature, webhookDedupeKey } from "@/lib/meta/webhook";
import { enqueue } from "@/lib/queue";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  deserializeEvent,
  isActionable,
  recordWebhookEvent,
  releaseWebhookEvent,
  type ClaimedWebhookEvent,
} from "@/lib/webhooks/events";

type ActionableEvent = Extract<NormalizedEvent, { kind: "comment" | "message" | "postback" }>;

/** With the queue's backoff, five attempts span about a quarter of an hour. */
const WEBHOOK_JOB_ATTEMPTS = 5;

/**
 * The route claims a job within milliseconds of queuing it. Due a moment
 * early, it cannot look scheduled for the future to a database whose clock
 * runs slightly behind ours, which would leave it for the next cron tick.
 */
const DUE_EARLY_MS = 1_000;

const webhookJobSchema = z.object({ dedupeKey: z.string().min(1) });

export type AcceptWebhookResult =
  | { status: "invalid_signature" }
  | { status: "invalid_json" }
  | {
      status: "accepted";
      /** Events in the body worth acting on. */
      events: number;
      /** PROCESS_WEBHOOK jobs this delivery queued, in the order Meta sent the events. */
      jobIds: string[];
      /** Events that could not be stored or queued: Meta has to send the body again. */
      failed: number;
    };

/** Facebook-app webhooks sign with META_APP_SECRET; Instagram Login webhooks with INSTAGRAM_APP_SECRET. Try both. */
function isSignatureValid(rawBody: string, signature: string | null): boolean {
  const secrets = [optionalEnv("META_APP_SECRET"), optionalEnv("INSTAGRAM_APP_SECRET")].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) {
    if (process.env.NODE_ENV === "production") return false;
    logger.warn("webhook.unsigned_dev_mode", { hint: "Set META_APP_SECRET / INSTAGRAM_APP_SECRET to verify signatures" });
    return true;
  }
  return secrets.some((secret) => verifyMetaSignature(rawBody, signature, secret));
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/** Where the event came from: a comment's change field ("comments", "live_comments", "feed"), otherwise its kind. */
function fieldOf(event: ActionableEvent): string {
  const raw = event.raw;
  if (event.kind === "comment" && typeof raw === "object" && raw !== null && "field" in raw && typeof raw.field === "string") {
    return raw.field;
  }
  return event.kind;
}

/** Stores the event and queues its job. The new job's id, or null when there is nothing (more) to queue. */
async function acceptEvent(event: ActionableEvent): Promise<string | null> {
  const stored = await recordWebhookEvent(event, fieldOf(event));
  if (stored.processed) {
    logger.debug("webhook.event_duplicate", { dedupeKey: stored.dedupeKey, processed: true });
    return null;
  }
  // A stored but unprocessed event normally has its job already, and enqueue returns null for it. It has none when
  // queuing failed on an earlier delivery, and this one puts that right.
  const job = await enqueue({
    type: JobType.PROCESS_WEBHOOK,
    payload: { dedupeKey: stored.dedupeKey },
    dedupeKey: `webhook:${stored.dedupeKey}`,
    maxAttempts: WEBHOOK_JOB_ATTEMPTS,
    runAt: new Date(Date.now() - DUE_EARLY_MS),
  });
  if (!job) {
    logger.debug("webhook.event_duplicate", { dedupeKey: stored.dedupeKey, processed: false });
    return null;
  }
  logger.debug("webhook.event_queued", { dedupeKey: stored.dedupeKey, jobId: job.id, redelivered: !stored.created });
  return job.id;
}

/**
 * Everything the webhook request does: verify, parse, store, queue. Never
 * throws. An event that cannot be stored or queued is counted in `failed` so
 * the route can ask Meta to send the body again; the events that were stored
 * are recognized by their dedupe keys when it does.
 */
export async function acceptWebhookBody(rawBody: string, signature: string | null): Promise<AcceptWebhookResult> {
  if (!isSignatureValid(rawBody, signature)) return { status: "invalid_signature" };

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: "invalid_json" };
  }

  const events = normalizeWebhookPayload(body).filter(isActionable);
  const jobIds: string[] = [];
  let failed = 0;
  // In the order Meta sent them, so the jobs run in that order too.
  for (const event of events) {
    try {
      const jobId = await acceptEvent(event);
      if (jobId) jobIds.push(jobId);
    } catch (err) {
      failed++;
      logger.error("webhook.store_failed", { dedupeKey: webhookDedupeKey(event), error: describe(err) });
    }
  }
  logger.debug("webhook.accepted", { events: events.length, queued: jobIds.length, failed });
  return { status: "accepted", events: events.length, jobIds, failed };
}

/** Everything after the claim. Throws when the event should be tried again. */
async function handleClaimedEvent(claimed: ClaimedWebhookEvent): Promise<void> {
  const { dedupeKey } = claimed;
  const event = deserializeEvent(claimed.payload);
  if (!event) {
    // Written before payloads carried the normalized event, when only Meta's raw entry was kept: nothing to rebuild.
    await completeWebhookEvent(dedupeKey, "legacy_payload");
    logger.info("webhook.legacy_payload", { dedupeKey });
    return;
  }

  const channel = await prisma.channel.findUnique({
    where: { platform_externalId: { platform: event.platform, externalId: event.channelExternalId } },
  });
  if (!channel) {
    await completeWebhookEvent(dedupeKey, "channel_not_found");
    logger.info("webhook.channel_not_found", { platform: event.platform, externalId: event.channelExternalId, kind: event.kind });
    return;
  }
  if (channel.status === ChannelStatus.DISCONNECTED) {
    await completeWebhookEvent(dedupeKey, "channel_disconnected");
    logger.debug("webhook.channel_disconnected", { dedupeKey, channelId: channel.id });
    return;
  }
  if (event.kind === "comment" && channel.status !== ChannelStatus.ACTIVE) {
    // The token expired or the account errored, so a private reply would fail and retrying cannot fix that. The
    // reconcile poll feeds the comment through once the account is reconnected: it looks back 72 hours, well inside
    // the 7 days Meta allows for a private reply.
    await releaseWebhookEvent(dedupeKey, "channel_inactive");
    logger.debug("webhook.comment_deferred", { dedupeKey, channelId: channel.id, status: channel.status });
    return;
  }

  // Messages and button taps go in even while the account needs reconnecting, so the inbox has them.
  await handleIncomingEvent(channel, event);
  await completeWebhookEvent(dedupeKey);
  logger.debug("webhook.event_processed", { dedupeKey, channelId: channel.id, kind: event.kind });
}

/** PROCESS_WEBHOOK: handles one stored event. Throws to have the queue try again later. */
export async function processWebhookJob(job: Job): Promise<void> {
  const parsed = webhookJobSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("webhook.job_bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  const { dedupeKey } = parsed.data;

  const claimed = await claimWebhookEvent(dedupeKey);
  if (!claimed) {
    // Already processed, or someone else holds the lease: for a comment, the reconcile poll.
    logger.debug("webhook.event_not_claimed", { jobId: job.id, dedupeKey });
    return;
  }

  try {
    await handleClaimedEvent(claimed);
  } catch (err) {
    const error = describe(err);
    logger.warn("webhook.event_failed", { dedupeKey, jobId: job.id, attempt: job.attempts, maxAttempts: job.maxAttempts, error });
    try {
      await releaseWebhookEvent(dedupeKey, error);
    } catch (releaseErr) {
      // The lease expires by itself; until it does, no attempt can claim the event.
      logger.error("webhook.release_failed", { dedupeKey, error: describe(releaseErr) });
    }
    throw err;
  }
}
