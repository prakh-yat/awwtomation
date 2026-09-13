import { NextResponse } from "next/server";

import { assertOrganizationMembership, listInvitations, listMembers } from "@/lib/services/organizations";
import { withUser } from "@/lib/workspace/api";
import { roleAtLeast } from "@/lib/workspace/permissions";

export const runtime = "nodejs";

type Params = { id: string };

/** Members plus pending invitations. Invite links are only included for ADMIN+. */
export const GET = withUser<Params>(async (_req, user, { params }) => {
  const { id } = await params;
  const membership = await assertOrganizationMembership(id, user.id, "MEMBER");
  const isAdmin = roleAtLeast(membership.role, "ADMIN");
  const [members, invitations] = await Promise.all([listMembers(id), listInvitations(id, { status: "PENDING", includeLinks: isAdmin })]);
  return NextResponse.json({ members, invitations, role: membership.role });
});
