import { NextResponse } from "next/server";

import { deliveryLogQuerySchema, exportLogsCsv } from "@/lib/services/logs";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * GET /api/logs/export?status=&kind=&channelId=&automationId=&broadcastId=&q=&from=&to=
 * → text/csv attachment. Same filters as the list (cursor/limit ignored); capped at 50,000 rows.
 */
export const GET = withWorkspace(async (req, ctx) => {
  const { cursor: _cursor, limit: _limit, ...filters } = parseQuery(req, deliveryLogQuerySchema);
  const csv = await exportLogsCsv(ctx.workspace.id, { ...filters, timezone: ctx.workspace.timezone });
  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel detects UTF-8 (usernames and previews are frequently non-ASCII).
  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="delivery-logs-${ctx.workspace.slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
