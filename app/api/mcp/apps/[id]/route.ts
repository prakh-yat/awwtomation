import { NextResponse } from "next/server";

import { revokeGrant } from "@/lib/services/mcp-access";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * DELETE /api/mcp/apps/[id] → { ok: true }. Disconnects an AI app from the
 * active organization. Your own for anyone; anyone's for admins and owners.
 */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await revokeGrant(id, { userId: ctx.user.id, organizationId: ctx.organization.id, role: ctx.role });
  return NextResponse.json({ ok: true });
});
