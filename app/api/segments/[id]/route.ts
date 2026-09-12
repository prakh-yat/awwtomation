import { NextResponse } from "next/server";

import { deleteSegment, getSegment, updateSegment, updateSegmentSchema } from "@/lib/services/segments";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/segments/[id] → { segment: SegmentSummary } */
export const GET = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const segment = await getSegment(ctx.workspace.id, id);
  if (!segment) throw new ApiError(404, "Segment not found", "NOT_FOUND");
  return NextResponse.json({ segment });
});

/** PATCH /api/segments/[id] { name?, description?, filters? } → { segment: SegmentSummary } */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const input = await parseBody(req, updateSegmentSchema);
  const segment = await updateSegment(ctx.workspace.id, id, input, ctx.user.id);
  return NextResponse.json({ segment });
});

/** DELETE /api/segments/[id] → { ok: true }. Broadcasts keep their own copy of the filters. */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await deleteSegment(ctx.workspace.id, id, ctx.user.id);
  return NextResponse.json({ ok: true });
});
