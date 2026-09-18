import { NextResponse } from "next/server";

import { listInvitations, listMembers } from "@/lib/services/organizations";
import { assertMembership } from "@/lib/services/workspaces";
import { withUser } from "@/lib/workspace/api";
import { roleAtLeast } from "@/lib/workspace/permissions";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * The people who can work in this workspace: its organization's members, plus
 * pending invitations. Invite links are only included for ADMIN+: a plain
 * member must not be able to hand out seats.
 */
export const GET = withUser<Params>(async (_req, user, { params }) => {
  const { id } = await params;
  const { workspace, role } = await assertMembership(id, user.id, "MEMBER");
  const isAdmin = roleAtLeast(role, "ADMIN");

  const [members, invitations] = await Promise.all([
    listMembers(workspace.organizationId),
    listInvitations(workspace.organizationId, { status: "PENDING", includeLinks: isAdmin }),
  ]);

  return NextResponse.json({ members, invitations, role });
});
