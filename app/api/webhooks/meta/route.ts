import { after, type NextRequest } from "next/server";
import { constantTimeEqual, randomToken } from "@/lib/crypto";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { claimJobsByIds, runJob } from "@/lib/queue";
import { ONE_MEGABYTE, PayloadTooLargeError, readBodyWithLimit } from "@/lib/security/body-limit";
import { checkLocalRateLimit, clientIp, ONE_MINUTE_MS, rateLimitResponse } from "@/lib/security/rate-limit-ip";
import { acceptWebhookBody } from "@/lib/webhooks/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Room to handle the events after the answer has gone out (see `runQueuedJobs`). */
export const maxDuration = 60;

/**
 * Only requests whose signature does not verify are limited, and only in this
 * process. Meta's own deliveries never are: a viral post sends hundreds a
 * minute from a handful of addresses. And a database write per forged request
 * is exactly what a flood wants.
 */
const INVALID_SIGNATURE_LIMIT_PER_MINUTE = 600;
const WEBHOOK_MAX_BODY_BYTES = ONE_MEGABYTE;
/** No queued job starts later than this into the request, leaving the one running time to finish under maxDuration. */
const RUN_NOW_BUDGET_MS = 45_000;

function received(): Response {
  return new Response("EVENT_RECEIVED", { status: 200, headers: { "content-type": "text/plain" } });
}

/** Meta's one-time subscription handshake: echo `hub.challenge` when the verify token matches. */
export async function GET(req: NextRequest): Promise<Response> {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = optionalEnv("META_WEBHOOK_VERIFY_TOKEN");

  if (mode === "subscribe" && expected && token && challenge && constantTimeEqual(token, expected)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  logger.warn("webhook.verify_rejected", { mode, hasToken: Boolean(token), configured: Boolean(expected) });
  return new Response("Forbidden", { status: 403 });
}

/**
 * Handles the jobs this delivery queued, one at a time in the order Meta sent
 * the events, so a host without a worker does not leave them for the next
 * cron tick. Each is claimed just before it runs: one this request never gets
 * to (the budget ran out, the instance was stopped) stays PENDING for the
 * worker or the cron tick instead of sitting locked until the stale-lock
 * release. Never throws: it runs after the response, where nobody would hear.
 */
async function runQueuedJobs(jobIds: readonly string[], deadline: number): Promise<void> {
  const workerId = `webhook-route:${randomToken(6)}`;
  for (const [index, id] of jobIds.entries()) {
    if (Date.now() >= deadline) {
      logger.info("webhook.left_for_worker", { workerId, jobs: jobIds.length - index });
      return;
    }
    try {
      const [job] = await claimJobsByIds(workerId, [id]);
      if (job) await runJob(job);
    } catch (err) {
      // Only the claim can throw (runJob never does): the database is unwell, so leave the rest to the worker.
      logger.error("webhook.run_now_failed", { workerId, jobId: id, error: err instanceof Error ? err.message : String(err) });
      return;
    }
  }
}

/**
 * Stores and queues every event, answers, then handles them. 200 for anything
 * Meta should not send again, a body we cannot use included. The exceptions:
 * 413 and 429, which only traffic that is not Meta's ever sees, and 500 when
 * an event could not be stored, so Meta sends the body again instead of the
 * event being lost (the events that were stored are recognized when it does).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const startedAt = Date.now();

  let rawBody = "";
  try {
    rawBody = await readBodyWithLimit(req, WEBHOOK_MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      logger.warn("webhook.body_too_large", { ip: clientIp(req), declared: req.headers.get("content-length") });
      return new Response("Payload Too Large", { status: 413, headers: { "content-type": "text/plain" } });
    }
    logger.error("webhook.body_read_error", { error: err instanceof Error ? err.message : String(err) });
    return received();
  }

  const signature = req.headers.get("x-hub-signature-256");
  const result = await acceptWebhookBody(rawBody, signature);

  if (result.status === "invalid_signature") {
    const ip = clientIp(req);
    const limit = checkLocalRateLimit("webhook_invalid", ip, INVALID_SIGNATURE_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
    if (!limit.allowed) return rateLimitResponse(limit);
    logger.warn("webhook.invalid_signature", { ip, hasSignature: Boolean(signature), bytes: rawBody.length });
    return received();
  }
  if (result.status === "invalid_json") {
    logger.warn("webhook.invalid_json", { bytes: rawBody.length });
    return received();
  }

  const { jobIds } = result;
  if (jobIds.length > 0) after(() => runQueuedJobs(jobIds, startedAt + RUN_NOW_BUDGET_MS));

  if (result.failed > 0) return new Response("EVENT_NOT_STORED", { status: 500, headers: { "content-type": "text/plain" } });
  return received();
}
