import { NextResponse } from "next/server";
import { z } from "zod";

import { switchOrganization } from "@/lib/services/organizations";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

const switchSchema = z.object({ organizationId: z.string().min(1).max(64) });

/**
 * Opens another organization the caller belongs to. The workspace cookie moves
 * with it: a workspace id from the previous organization means nothing here.
 */
export const POST = withUser(async (req, user) => {
  const { organizationId } = await parseBody(req, switchSchema);
  const { organization, workspace } = await switchOrganization(user.id, organizationId);
  const res = NextResponse.json({ ok: true, organization: { id: organization.id, name: organization.name }, workspace: { id: workspace.id } });
  res.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organization.id, activeWorkspaceCookieOptions());
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, activeWorkspaceCookieOptions());
  return res;
});
