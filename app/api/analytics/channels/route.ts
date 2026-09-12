import { NextResponse } from "next/server";
import { z } from "zod";

import { getChannelBreakdown, parseAnalyticsPeriod } from "@/lib/services/analytics";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const querySchema = z.object({ days: z.string().optional() });

/** GET /api/analytics/channels?days=7|30|90 — sent / triggered / contacts per connected channel. */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, querySchema);
  const channels = await getChannelBreakdown(ctx.workspace.id, parseAnalyticsPeriod(query.days), ctx.workspace.timezone);
  return NextResponse.json({ channels });
});
