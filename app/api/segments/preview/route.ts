import { NextResponse } from "next/server";

import { countContacts, previewSegmentSchema } from "@/lib/services/segments";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** POST /api/segments/preview { filters } → { count }. Same predicate as the list, so the number matches the table. */
export const POST = withWorkspace(async (req, ctx) => {
  const { filters } = await parseBody(req, previewSegmentSchema);
  const count = await countContacts(ctx.workspace.id, filters);
  return NextResponse.json({ count });
});
