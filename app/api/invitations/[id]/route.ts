import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { revokeInvitation } from "@/lib/services/organizations";
import { ApiError, withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * Revokes a pending invitation. The invitation's own organization is used for
 * the permission check (ADMIN+), not the active-organization cookie.
 */
export const DELETE = withUser<Params>(async (_req, user, { params }) => {
  const { id } = await params;
  const invitation = await prisma.invitation.findUnique({ where: { id }, select: { organizationId: true } });
  if (!invitation) throw new ApiError(404, "Invitation not found", "NOT_FOUND");

  await revokeInvitation(invitation.organizationId, id, user.id);
  return NextResponse.json({ ok: true });
});
