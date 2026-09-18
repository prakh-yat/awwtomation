import { NextResponse } from "next/server";

import { automationTestSchema, testAutomation } from "@/lib/services/automations";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * POST /api/automations/[id]/test { text, mediaId?, overrides? } → AutomationTestResult
 * Dry run only: nothing is sent, no DeliveryLog is written.
 */
export const POST = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, automationTestSchema);
  const result = await testAutomation(ctx.workspace.id, id, body);
  return NextResponse.json(result);
});
