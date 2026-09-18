import { NextResponse } from "next/server";

import { cancelBroadcast } from "@/lib/services/broadcasts";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** POST /api/broadcasts/[id]/cancel → { broadcast, cancelledJobs }: SCHEDULED/SENDING → CANCELLED. */
export const POST = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await cancelBroadcast(ctx.workspace.id, id, ctx.user.id);
  return NextResponse.json(result);
});
