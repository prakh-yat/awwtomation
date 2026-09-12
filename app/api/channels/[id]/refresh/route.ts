import { NextResponse } from "next/server";

import { refreshChannel } from "@/lib/services/channels";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** Re-reads the profile, retries the webhook subscription and re-syncs media. Any member may trigger it. */
export const POST = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const channel = await refreshChannel(ctx.workspace.id, id);
  return NextResponse.json({ channel });
});
