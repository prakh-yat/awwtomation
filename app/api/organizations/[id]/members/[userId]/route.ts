import { NextResponse } from "next/server";
import { z } from "zod";

import { removeMember, updateMemberRole, workspaceRoleSchema } from "@/lib/services/organizations";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, readActiveOrganizationCookie } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

type Params = { id: string; userId: string };

const roleSchema = z.object({ role: workspaceRoleSchema });

/** OWNER only (enforced in the service). Cannot demote the last owner. */
export const PATCH = withUser<Params>(async (req, user, { params }) => {
  const { id, userId } = await params;
  const { role } = await parseBody(req, roleSchema);
  const member = await updateMemberRole(id, user.id, userId, role);
  return NextResponse.json({ member });
});

/** Remove a member, or leave the organization when `userId` is the caller. */
export const DELETE = withUser<Params>(async (_req, user, { params }) => {
  const { id, userId } = await params;
  await removeMember(id, user.id, userId);

  const res = NextResponse.json({ ok: true, left: userId === user.id });
  // Leaving the active organization: drop the cookies so the next page load
  // falls back to another membership (or /onboarding).
  if (userId === user.id && (await readActiveOrganizationCookie()) === id) {
    res.cookies.set(ACTIVE_ORGANIZATION_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
});
