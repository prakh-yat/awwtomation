import { NextResponse } from "next/server";

import { deliveryLogQuerySchema, getLogStats, listDeliveryLogs } from "@/lib/services/logs";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * GET /api/logs?status=&kind=&channelId=&automationId=&broadcastId=&contactId=&q=&from=&to=&cursor=&limit=
 * → { items: DeliveryLogItem[], nextCursor: string | null, stats: LogStats | null }
 *
 * `from`/`to` are YYYY-MM-DD in the workspace timezone (inclusive). `stats`
 * (counts by status, ignoring the status filter) is computed for the first
 * page only — "Load more" requests carry a cursor and get `stats: null`.
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, deliveryLogQuerySchema);
  const timezone = ctx.workspace.timezone;
  const { cursor, limit, ...filters } = query;

  const [page, stats] = await Promise.all([
    listDeliveryLogs(ctx.workspace.id, { ...filters, cursor, limit, timezone }),
    cursor ? Promise.resolve(null) : getLogStats(ctx.workspace.id, { ...filters, timezone }),
  ]);

  return NextResponse.json({ ...page, stats });
});
