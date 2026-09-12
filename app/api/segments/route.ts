import { NextResponse } from "next/server";

import { createSegment, createSegmentSchema, listSegments } from "@/lib/services/segments";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/segments → { segments: SegmentSummary[] } (name order, live counts). */
export const GET = withWorkspace(async (_req, ctx) => {
  const segments = await listSegments(ctx.workspace.id);
  return NextResponse.json({ segments });
});

/**
 * POST /api/segments { name, description?, filters } → { segment: SegmentSummary } (201)
 * 409 CONFLICT on a duplicate name (case-insensitive), 409 LIMIT past the per-workspace cap.
 */
export const POST = withWorkspace(async (req, ctx) => {
  const input = await parseBody(req, createSegmentSchema);
  const segment = await createSegment(ctx.workspace.id, input, ctx.user.id);
  return NextResponse.json({ segment }, { status: 201 });
});
