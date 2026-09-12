import { NextResponse } from "next/server";

import { ActivationBlockedError, automationStatusSchema, setAutomationStatus } from "@/lib/services/automations";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * POST /api/automations/[id]/status { status: "ACTIVE" | "PAUSED" } → { automation }
 * 422 { error, code: "ACTIVATION_BLOCKED", errors: string[] } when activation rules fail.
 */
export const POST = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { status } = await parseBody(req, automationStatusSchema);
  try {
    const automation = await setAutomationStatus(ctx.workspace.id, id, status, ctx.user.id);
    return NextResponse.json({ automation });
  } catch (err) {
    // Surface every blocker so the builder can list them, not just the joined message.
    if (err instanceof ActivationBlockedError) {
      return NextResponse.json({ error: err.message, code: err.code, errors: err.errors }, { status: err.status });
    }
    throw err;
  }
});
