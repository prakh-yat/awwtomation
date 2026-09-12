import { NextResponse } from "next/server";

import { assertRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { sendBroadcast } from "@/lib/services/broadcasts";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** Per-user cap: every send fans out into one job per contact, so ten a minute is already generous. */
const SEND_LIMIT_PER_MINUTE = 10;

/**
 * POST /api/broadcasts/[id]/send → { broadcast, total, eligible, skippedWindow, enqueued }
 * DRAFT/SCHEDULED → SENDING. 402 PLAN_LIMIT, 409 INVALID_STATE / CHANNEL_INACTIVE, 429 RATE_LIMITED.
 */
export const POST = withWorkspace<Params>(async (_req, ctx, { params }) => {
  assertRateLimit("broadcast_send", ctx.user.id, SEND_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  const { id } = await params;
  const result = await sendBroadcast(ctx.workspace.id, id, ctx.user.id);
  return NextResponse.json(result);
});
