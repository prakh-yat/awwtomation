import { NextResponse } from "next/server";

import { bulkIdsSchema, contactListQuerySchema, deleteContacts, listContacts } from "@/lib/services/contacts";
import { parseBody, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * GET /api/contacts?q=&channelId=&tags=a,b&tagMode=all|any&follower=&optedOut=&cursor=&limit=&sort=
 * → { items: ContactListItem[], nextCursor: string | null }
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, contactListQuerySchema);
  const result = await listContacts(ctx.workspace.id, query);
  return NextResponse.json(result);
});

/** DELETE /api/contacts { ids: string[] } → { deleted: number }. Cascades conversations and sessions. */
export const DELETE = withWorkspace(async (req, ctx) => {
  const { ids } = await parseBody(req, bulkIdsSchema);
  const result = await deleteContacts(ctx.workspace.id, ids);
  return NextResponse.json(result);
});
