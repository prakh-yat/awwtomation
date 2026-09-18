import { NextResponse } from "next/server";
import { z } from "zod";

import { emailSchema, invitationUrl, inviteMember, workspaceRoleSchema } from "@/lib/services/organizations";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const inviteSchema = z.object({
  email: emailSchema,
  role: workspaceRoleSchema.default("MEMBER"),
});

/**
 * Creates an invite link into the active organization. The email is not sent by
 * us: the admin shares `inviteUrl`.
 */
export const POST = withWorkspace(
  async (req, ctx) => {
    const body = await parseBody(req, inviteSchema);
    const invitation = await inviteMember(ctx.organization.id, ctx.user.id, body.email, body.role);
    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
        inviteUrl: invitationUrl(invitation.token),
      },
      { status: 201 },
    );
  },
  { minRole: "ADMIN" },
);
