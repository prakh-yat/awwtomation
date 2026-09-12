import { NextResponse } from "next/server";

import { assertMembership, listInvitations, listMembers } from "@/lib/services/workspaces";
import { withUser } from "@/lib/workspace/api";
import { roleAtLeast } from "@/lib/workspace/permissions";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * Members plus pending invitations. Invite links are only included for
 * ADMIN+ — a plain member must not be able to hand out seats.
 */
export const GET = withUser<Params>(async (_req, user, { params }) => {
  const { id } = await params;
  const membership = await assertMembership(id, user.id, "MEMBER");
  const isAdmin = roleAtLeast(membership.role, "ADMIN");

  const [members, invitations] = await Promise.all([
    listMembers(id),
    listInvitations(id, { status: "PENDING", includeLinks: isAdmin }),
  ]);

  return NextResponse.json({ members, invitations, role: membership.role });
});
