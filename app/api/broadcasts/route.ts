import { NextResponse } from "next/server";

import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { createBroadcast, createBroadcastSchema, listBroadcasts, toBroadcastRow } from "@/lib/services/broadcasts";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/broadcasts → { broadcasts: BroadcastRow[], plan: { broadcasts: boolean } } newest first. */
export const GET = withWorkspace(async (_req, ctx) => {
  const broadcasts = await listBroadcasts(ctx.workspace.id);
  return NextResponse.json({
    broadcasts: broadcasts.map(toBroadcastRow),
    plan: { broadcasts: limitsFor(effectivePlan(ctx.organization)).broadcasts },
  });
});

/**
 * POST /api/broadcasts { name, channelId, message, audience?, scheduledAt? } → { broadcast } (201)
 * 402 PLAN_LIMIT when the plan has no broadcasts; scheduledAt (ISO) makes it SCHEDULED, otherwise DRAFT.
 */
export const POST = withWorkspace(async (req, ctx) => {
  const input = await parseBody(req, createBroadcastSchema);
  const broadcast = await createBroadcast(ctx.workspace.id, input, ctx.user.id);
  return NextResponse.json({ broadcast }, { status: 201 });
});
