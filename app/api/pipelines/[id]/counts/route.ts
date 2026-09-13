import { NextResponse } from "next/server";

import { contactListQuerySchema, pipelineStageCounts, resolveOwnerFilter } from "@/lib/services/contacts";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * GET /api/pipelines/:id/counts?<contact list filters> → { counts: { [stageId]: number } }
 * Stage numbers for the contacts page, narrowed by the same filters as the list.
 */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const query = parseQuery(req, contactListQuerySchema);
  const counts = await pipelineStageCounts(ctx.workspace.id, id, { ...query, ownerId: resolveOwnerFilter(query.ownerId, ctx.user.id) });
  return NextResponse.json({ counts });
});
