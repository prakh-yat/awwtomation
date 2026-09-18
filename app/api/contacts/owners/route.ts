import { NextResponse } from "next/server";

import { listOwners } from "@/lib/services/contacts";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/contacts/owners → { owners: Array<{ id, name, email, avatarUrl, role }> }, the people a contact can be assigned to. */
export const GET = withWorkspace(async (_req, ctx) => {
  const owners = await listOwners(ctx.workspace.id);
  return NextResponse.json({ owners });
});
