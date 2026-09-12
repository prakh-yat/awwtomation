import { NextResponse } from "next/server";

import { authorizeCron, cronError } from "@/app/api/cron/_auth";
import { logger } from "@/lib/logger";
import { processDueBroadcasts } from "@/lib/services/broadcasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/broadcasts/process-due (Authorization: Bearer CRON_SECRET)
 * → { ok, started: string[], failed: [{ id, error }], finalized: string[] }
 *
 * Starts SCHEDULED broadcasts that are due and finalizes stuck SENDING ones.
 * Fallback for deployments without the long-running worker; the worker should
 * call `processDueBroadcasts()` on its own interval.
 */
async function handler(req: Request): Promise<NextResponse> {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const result = await processDueBroadcasts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("broadcast.process_due_error", { error: err instanceof Error ? err.message : String(err) });
    return cronError(err);
  }
}

export const POST = handler;
export const GET = handler;
