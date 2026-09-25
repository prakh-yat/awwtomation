import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { runHousekeeping } from "@/lib/services/retention";
import { authorizeCron, cronError } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Leave headroom under maxDuration for the batch in flight to finish. */
const TIME_BUDGET_MS = 45_000;

/**
 * Daily: prune old jobs, webhook receipts, delivery logs and messages (see
 * lib/services/retention.ts). The worker does the same every few hours; this
 * covers deployments without one. A large backlog takes several runs.
 */
async function housekeeping(req: Request): Promise<NextResponse> {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const result = await runHousekeeping(TIME_BUDGET_MS);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron.housekeeping_error", { error: err instanceof Error ? err.message : String(err) });
    return cronError(err);
  }
}

export const GET = housekeeping;
export const POST = housekeeping;
