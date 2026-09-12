import { NextResponse } from "next/server";
import { z } from "zod";

import { getOverview, parseAnalyticsPeriod } from "@/lib/services/analytics";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const querySchema = z.object({
  days: z.string().optional(),
  channelId: z.string().trim().min(1).max(64).optional(),
});

/**
 * GET /api/analytics/overview?days=7|30|90&channelId=
 * Dashboard KPIs, daily series, top automations, skip reasons, recent
 * activity and plan usage for the active workspace.
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, querySchema);
  const overview = await getOverview(ctx.workspace.id, {
    days: parseAnalyticsPeriod(query.days),
    channelId: query.channelId,
    timezone: ctx.workspace.timezone,
  });
  return NextResponse.json(overview);
});
