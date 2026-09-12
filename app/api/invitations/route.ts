import { NextResponse } from "next/server";
import { z } from "zod";

import { assertMembership, emailSchema, invitationUrl, inviteMember, workspaceRoleSchema } from "@/lib/services/workspaces";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const inviteSchema = z.object({
  email: emailSchema,
  role: workspaceRoleSchema.default("MEMBER"),
  /** Defaults to the active workspace; when given, membership is re-checked for that id. */
  workspaceId: z.string().min(1).max(64).optional(),
});

/** Creates an invite link. The email is not sent by us — the admin shares `inviteUrl`. */
export const POST = withWorkspace(
  async (req, ctx) => {
    const body = await parseBody(req, inviteSchema);
    const workspaceId = body.workspaceId ?? ctx.workspace.id;
    if (workspaceId !== ctx.workspace.id) await assertMembership(workspaceId, ctx.user.id, "ADMIN");

    const invitation = await inviteMember(workspaceId, ctx.user.id, body.email, body.role);
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
