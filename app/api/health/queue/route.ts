import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getQueueStats } from "@/lib/queue";
import { isQueueStalled, queueAlertAfterSeconds } from "@/lib/services/ops-alerts";
import { authorizeCron } from "../../cron/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Queue probe for an uptime monitor: 503 once the oldest due job has waited
 * longer than QUEUE_ALERT_AFTER_SECONDS, which means nothing is taking jobs
 * (no worker, no cron tick, or neither keeping up). It is the one check that
 * catches a worker that is not running at all, which cannot alert about
 * itself. Kept apart from /api/health on purpose: restarting the web container
 * fixes none of this, so never use it as a liveness check.
 *
 * The public answer is the one number a monitor needs. With the cron secret
 * (the same header or `?token=` the cron routes take) it adds the counts.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const stats = await getQueueStats();
    const ok = !isQueueStalled(stats);
    const body = authorizeCron(req) === null ? { ok, ...stats, alertAfterSeconds: queueAlertAfterSeconds() } : { ok, oldestDueSeconds: stats.oldestDueSeconds };
    return NextResponse.json(body, { status: ok ? 200 : 503, headers: NO_STORE });
  } catch (err) {
    logger.error("health.queue_unavailable", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: "Queue status unavailable", code: "queue_unavailable" }, { status: 503, headers: NO_STORE });
  }
}
