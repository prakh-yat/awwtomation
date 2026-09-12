import { NextResponse } from "next/server";

import { duplicateAutomation } from "@/lib/services/automations";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** POST /api/automations/[id]/duplicate → { automation: AutomationDetail } (201, always DRAFT) */
export const POST = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const automation = await duplicateAutomation(ctx.workspace.id, id, ctx.user.id);
  return NextResponse.json({ automation }, { status: 201 });
});
