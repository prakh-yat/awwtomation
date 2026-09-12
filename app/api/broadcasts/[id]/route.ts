import { NextResponse } from "next/server";

import { deleteBroadcast, getBroadcast, toBroadcastRow, updateBroadcast, updateBroadcastSchema } from "@/lib/services/broadcasts";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/broadcasts/[id] → { broadcast: BroadcastRow, stats, deliveries, deliveryTotal } */
export const GET = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const detail = await getBroadcast(ctx.workspace.id, id);
  if (!detail) throw new ApiError(404, "Broadcast not found", "NOT_FOUND");
  return NextResponse.json({
    broadcast: toBroadcastRow(detail),
    stats: detail.stats,
    deliveries: detail.deliveries,
    deliveryTotal: detail.deliveryTotal,
  });
});

/**
 * PATCH /api/broadcasts/[id] { name?, channelId?, message?, audience?, scheduledAt? } → { broadcast }
 * DRAFT/SCHEDULED only (409 INVALID_STATE otherwise). `scheduledAt: null` unschedules back to DRAFT.
 */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const input = await parseBody(req, updateBroadcastSchema);
  const broadcast = await updateBroadcast(ctx.workspace.id, id, input, ctx.user.id);
  return NextResponse.json({ broadcast });
});

/** DELETE /api/broadcasts/[id] → { ok: true } — DRAFT/CANCELLED/SENT/FAILED only. */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await deleteBroadcast(ctx.workspace.id, id, ctx.user.id);
  return NextResponse.json({ ok: true });
});
