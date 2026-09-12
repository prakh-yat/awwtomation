import { NextResponse } from "next/server";
import { z } from "zod";

import { CONTACT_LIST_DEFAULT_LIMIT, CONTACT_LIST_MAX_LIMIT, contactSortSchema, listContacts } from "@/lib/services/contacts";
import { getSegment } from "@/lib/services/segments";
import { ApiError, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(CONTACT_LIST_MAX_LIMIT).default(CONTACT_LIST_DEFAULT_LIMIT),
  sort: contactSortSchema.default("recent"),
});

/**
 * GET /api/segments/[id]/contacts?cursor=&limit=&sort= → { items: ContactListItem[], nextCursor }
 * The segment's stored filters go through the same `listContacts` as the contacts page.
 */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const segment = await getSegment(ctx.workspace.id, id);
  if (!segment) throw new ApiError(404, "Segment not found", "NOT_FOUND");
  const query = parseQuery(req, querySchema);
  const result = await listContacts(ctx.workspace.id, { ...segment.filters, ...query });
  return NextResponse.json(result);
});
