import { NextResponse } from "next/server";
import { z } from "zod";

import { getAnalytics } from "@/lib/services/analytics";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// Not exported: Next.js only allows route handlers and its own config fields
// to be exported from a route module, and rejects anything else at build time.
const analyticsQuerySchema = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
  channelId: z.string().trim().min(1).max(64).optional(),
  automationId: z.string().trim().min(1).max(64).optional(),
});

/**
 * GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&channelId=&automationId=
 * Full Analytics report (daily series, funnel, per-channel / per-automation
 * tables, keywords, skip reasons, heatmap, inbox performance, stages) for
 * the active workspace. Ranges are clamped to 366 days, never start before
 * the plan's history and never reach into the future; an unknown channel or
 * automation is a 404.
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, analyticsQuerySchema);
  const report = await getAnalytics(ctx.workspace.id, { ...query, timezone: ctx.workspace.timezone });
  return NextResponse.json(report);
});
