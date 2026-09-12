import { NextResponse } from "next/server";

import { getInboxCounts } from "@/lib/services/inbox";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/inbox/counts → { open, unread, mine } (open threads only; "mine" is assigned to the caller). */
export const GET = withWorkspace(async (_req, ctx) => {
  const counts = await getInboxCounts(ctx.workspace.id, ctx.user.id);
  return NextResponse.json(counts);
});
