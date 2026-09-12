import { NextResponse } from "next/server";

import { markRead } from "@/lib/services/inbox";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** POST /api/inbox/conversations/[id]/read → { ok: true }. Zeroes the unread counter. */
export const POST = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await markRead(ctx.workspace.id, id);
  return NextResponse.json({ ok: true });
});
