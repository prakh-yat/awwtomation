import { NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { processBatch, releaseStaleJobs } from "@/lib/queue";
import { checkQueueHealth } from "@/lib/services/ops-alerts";
import { authorizeCron, cronError } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A batch lasts as long as its slowest job, so a small one keeps the rest from waiting on a slow AI reply. */
const BATCH_SIZE = 10;
/**
 * No batch starts later than this into the request. The last one can hold an
 * AI reply of about 30 seconds and has to end inside maxDuration: a job killed
 * mid-run is only released ten minutes later and then runs again, so the
 * contact could get the same DM twice.
 */
const CLAIM_WINDOW_MS = 25_000;

/**
 * Drives the job queue when no long-running worker exists (Vercel Cron every
 * minute). Drains as many batches as fit in the claim window.
 */
async function tick(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const workerId = `cron:${randomToken(6)}`;
    // Read before this tick releases or runs anything, so it says how long work had been waiting for it.
    // Best effort: alerting never stops the queue from being processed.
    let stalled = false;
    try {
      stalled = (await checkQueueHealth()).stalled;
    } catch (err) {
      logger.error("cron.tick_health_error", { error: err instanceof Error ? err.message : String(err) });
    }
    const released = await releaseStaleJobs();
    // Start due scheduled broadcasts first so their jobs drain in this same tick.
    // Isolated so a broadcast problem never stops the queue from being processed.
    let broadcasts = { started: 0, failed: 0, finalized: 0 };
    try {
      const { processDueBroadcasts } = await import("@/lib/services/broadcasts");
      const due = await processDueBroadcasts();
      broadcasts = { started: due.started.length, failed: due.failed.length, finalized: due.finalized.length };
    } catch (err) {
      logger.error("cron.tick_broadcasts_error", { error: err instanceof Error ? err.message : String(err) });
    }
    // Expired MCP sign-in codes and tokens. Housekeeping only, so it never stops the tick either.
    try {
      const { purgeExpiredOAuthRows } = await import("@/lib/services/oauth");
      await purgeExpiredOAuthRows();
    } catch (err) {
      logger.error("cron.tick_oauth_purge_error", { error: err instanceof Error ? err.message : String(err) });
    }
    // Counted from the start of the request: the work above spends the same maxDuration.
    const deadline = startedAt + CLAIM_WINDOW_MS;
    let processed = 0;
    let failed = 0;
    let batches = 0;
    while (Date.now() < deadline) {
      const result = await processBatch(workerId, BATCH_SIZE);
      processed += result.processed;
      failed += result.failed;
      batches++;
      if (result.claimed < BATCH_SIZE) break;
    }
    logger.info("cron.tick", { workerId, released, processed, failed, batches, broadcasts, stalled });
    return NextResponse.json({ ok: true, released, processed, failed, batches, broadcasts, stalled });
  } catch (err) {
    logger.error("cron.tick_error", { error: err instanceof Error ? err.message : String(err) });
    return cronError(err);
  }
}

export const GET = tick;
export const POST = tick;
