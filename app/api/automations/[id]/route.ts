import { NextResponse } from "next/server";

import { automationUpdateSchema, deleteAutomation, getAutomation, updateAutomation } from "@/lib/services/automations";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/automations/[id] → { automation: AutomationDetail } */
export const GET = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const automation = await getAutomation(ctx.workspace.id, id);
  if (!automation) throw new ApiError(404, "Automation not found", "NOT_FOUND");
  return NextResponse.json({ automation });
});

/** PATCH /api/automations/[id] { ...Partial<AutomationInput> } → { automation, warnings: string[] } */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, automationUpdateSchema);
  const result = await updateAutomation(ctx.workspace.id, id, body, ctx.user.id);
  return NextResponse.json(result);
});

/** DELETE /api/automations/[id] → { ok: true } */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await deleteAutomation(ctx.workspace.id, id, ctx.user.id);
  return NextResponse.json({ ok: true });
});
