import { NextResponse } from "next/server";

import {
  bulkIdsSchema,
  contactListQuerySchema,
  createManualContact,
  createManualContactSchema,
  deleteContacts,
  listContacts,
  resolveOwnerFilter,
} from "@/lib/services/contacts";
import { parseBody, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * GET /api/contacts?q=&channelId=&tags=a,b&tagMode=all|any&pipelineId=&stageId=&ownerId=me|<id>|unassigned&page=&pageSize=&sort=
 * → { items: ContactListItem[], total, page, pageSize, pageCount }
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, contactListQuerySchema);
  const result = await listContacts(ctx.workspace.id, { ...query, ownerId: resolveOwnerFilter(query.ownerId, ctx.user.id) });
  return NextResponse.json(result);
});

/** POST /api/contacts { channelId, name, username?, email?, phone?, pipelineId?+stageId?, tags? } → 201 { contact } */
export const POST = withWorkspace(async (req, ctx) => {
  const input = await parseBody(req, createManualContactSchema);
  const contact = await createManualContact(ctx.workspace.id, input, ctx.user.id);
  return NextResponse.json({ contact: { id: contact.id } }, { status: 201 });
});

/** DELETE /api/contacts { ids: string[] } → { deleted: number }. Cascades conversations and sessions. */
export const DELETE = withWorkspace(async (req, ctx) => {
  const { ids } = await parseBody(req, bulkIdsSchema);
  const result = await deleteContacts(ctx.workspace.id, ids);
  return NextResponse.json(result);
});
