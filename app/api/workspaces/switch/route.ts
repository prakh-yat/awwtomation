import { NextResponse } from "next/server";
import { z } from "zod";

import { switchWorkspace } from "@/lib/services/workspaces";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

const switchSchema = z.object({ workspaceId: z.string().min(1).max(64) });

/**
 * Sets the active workspace cookie after verifying membership. The cookie is
 * set on the response explicitly (in addition to the service's cookie write)
 * so the behaviour is obvious to anyone reading this route.
 */
export const POST = withUser(async (req, user) => {
  const { workspaceId } = await parseBody(req, switchSchema);
  const { workspace, role } = await switchWorkspace(user.id, workspaceId);

  const res = NextResponse.json({
    ok: true,
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, plan: workspace.plan },
    role,
  });
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, activeWorkspaceCookieOptions());
  return res;
});
