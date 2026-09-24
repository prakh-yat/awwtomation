import { NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { processBatch, releaseStaleJobs } from "@/lib/queue";
import { authorizeCron, cronError } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 25;
/** Leave headroom under maxDuration for the final batch to finish. */
const TIME_BUDGET_MS = 45_000;

/**
 * Drives the job queue when no long-running worker exists (Vercel Cron every
 * minute). Drains as many batches as fit in the time budget.
 */
async function tick(req: Request): Promise<NextResponse> {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const workerId = `cron:${randomToken(6)}`;
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
    const deadline = Date.now() + TIME_BUDGET_MS;
    let processed = 0;
    let failed = 0;
    let batches = 0;
    for (;;) {
      const result = await processBatch(workerId, BATCH_SIZE);
      processed += result.processed;
      failed += result.failed;
      batches++;
      if (result.claimed < BATCH_SIZE || Date.now() >= deadline) break;
    }
    logger.info("cron.tick", { workerId, released, processed, failed, batches, broadcasts });
    return NextResponse.json({ ok: true, released, processed, failed, batches, broadcasts });
  } catch (err) {
    logger.error("cron.tick_error", { error: err instanceof Error ? err.message : String(err) });
    return cronError(err);
  }
}

export const GET = tick;
export const POST = tick;
