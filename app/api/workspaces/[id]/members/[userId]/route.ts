import { NextResponse } from "next/server";
import { z } from "zod";

import { removeMember, updateMemberRole, workspaceRoleSchema } from "@/lib/services/workspaces";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_WORKSPACE_COOKIE, readActiveWorkspaceCookie } from "@/lib/workspace/cookie";

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

/** Remove a member, or leave the workspace when `userId` is the caller. */
export const DELETE = withUser<Params>(async (_req, user, { params }) => {
  const { id, userId } = await params;
  await removeMember(id, user.id, userId);

  const res = NextResponse.json({ ok: true, left: userId === user.id });
  // Leaving the active workspace: drop the cookie so the next page load
  // falls back to another membership (or /onboarding).
  if (userId === user.id && (await readActiveWorkspaceCookie()) === id) {
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
});
