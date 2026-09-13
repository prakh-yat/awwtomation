import { NextResponse } from "next/server";

import { contactListQuerySchema, exportContactsCsv, resolveOwnerFilter } from "@/lib/services/contacts";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * GET /api/contacts/export?q=&channelId=&tags=&tagMode=&follower=&optedOut=
 * → text/csv attachment. Accepts the same filters as the list (page/pageSize/sort ignored).
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, contactListQuerySchema);
  const csv = await exportContactsCsv(ctx.workspace.id, { ...query, ownerId: resolveOwnerFilter(query.ownerId, ctx.user.id) });
  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel detects UTF-8 (usernames and names are frequently non-ASCII).
  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${ctx.workspace.slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
