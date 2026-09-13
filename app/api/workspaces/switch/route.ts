import { NextResponse } from "next/server";
import { z } from "zod";

import { switchWorkspace } from "@/lib/services/workspaces";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

const switchSchema = z.object({ workspaceId: z.string().min(1).max(64) });

/**
 * Opens a workspace after verifying the caller belongs to its organization.
 * Both cookies are written, so a workspace in another organization switches
 * the organization with it.
 */
export const POST = withUser(async (req, user) => {
  const { workspaceId } = await parseBody(req, switchSchema);
  const { workspace, role } = await switchWorkspace(user.id, workspaceId);

  const res = NextResponse.json({
    ok: true,
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    organization: { id: workspace.organization.id, name: workspace.organization.name },
    role,
  });
  res.cookies.set(ACTIVE_ORGANIZATION_COOKIE, workspace.organizationId, activeWorkspaceCookieOptions());
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, activeWorkspaceCookieOptions());
  return res;
});
