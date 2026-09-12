import { NextResponse } from "next/server";

import { adminWorkspacesQuerySchema, assertSuperAdmin, listWorkspaces } from "@/lib/services/admin";
import { parseQuery, withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/admin/workspaces?q=&plan=&cursor=&limit= — super admin only. */
export const GET = withUser(async (req, user) => {
  assertSuperAdmin(user);
  const query = parseQuery(req, adminWorkspacesQuerySchema);
  return NextResponse.json(await listWorkspaces(query));
});
