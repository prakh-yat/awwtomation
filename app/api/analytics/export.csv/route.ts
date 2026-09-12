import { z } from "zod";

import { exportAnalyticsCsv } from "@/lib/services/analytics";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const querySchema = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
  channelId: z.string().trim().min(1).max(64).optional(),
  automationId: z.string().trim().min(1).max(64).optional(),
});

/** GET /api/analytics/export.csv?from=&to=&channelId=&automationId= — the daily series as a CSV download. */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, querySchema);
  const { filename, csv } = await exportAnalyticsCsv(ctx.workspace.id, { ...query, timezone: ctx.workspace.timezone });
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
