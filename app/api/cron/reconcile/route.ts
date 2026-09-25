import { NextResponse } from "next/server";
import { enqueueReconcileJobs } from "@/lib/automation/reconcile";
import { logger } from "@/lib/logger";
import { authorizeCron, cronError } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every 15 minutes: queue a RECONCILE_COMMENTS job per channel with an active
 * comment automation, except channels paused for Meta's rate limits;
 * `/api/cron/tick` (or the worker) runs them.
 */
async function reconcile(req: Request): Promise<NextResponse> {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const enqueued = await enqueueReconcileJobs();
    logger.info("cron.reconcile", { enqueued });
    return NextResponse.json({ ok: true, enqueued });
  } catch (err) {
    logger.error("cron.reconcile_error", { error: err instanceof Error ? err.message : String(err) });
    return cronError(err);
  }
}

export const GET = reconcile;
export const POST = reconcile;
