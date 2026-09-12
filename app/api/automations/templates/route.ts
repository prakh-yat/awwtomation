import { NextResponse } from "next/server";

import { listTemplateSummaries } from "@/lib/services/templates";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/automations/templates → { templates: TemplateSummary[] } */
export const GET = withWorkspace(async () => {
  return NextResponse.json({ templates: listTemplateSummaries() });
});
