import { NextResponse } from "next/server";

import { analyticsQuerySchema, getAutomationAnalytics } from "@/lib/services/automations";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/automations/[id]/analytics?days=30 → AutomationAnalytics */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { days } = parseQuery(req, analyticsQuerySchema);
  const analytics = await getAutomationAnalytics(ctx.workspace.id, id, days);
  return NextResponse.json(analytics);
});
