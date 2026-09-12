import { NextResponse } from "next/server";

import { assertSuperAdmin, clearWorkspacePlanOverride, setPlanSchema, setWorkspacePlan } from "@/lib/services/admin";
import { parseBody, withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** POST /api/admin/workspaces/:id/plan { plan } — plan override (planSource = ADMIN_OVERRIDE), audited. */
export const POST = withUser<Params>(async (req, user, { params }) => {
  assertSuperAdmin(user);
  const { id } = await params;
  const { plan } = await parseBody(req, setPlanSchema);
  return NextResponse.json(await setWorkspacePlan(id, plan, user.id));
});

/** DELETE /api/admin/workspaces/:id/plan — clear the override; plan follows the subscription (or FREE) again. */
export const DELETE = withUser<Params>(async (_req, user, { params }) => {
  assertSuperAdmin(user);
  const { id } = await params;
  return NextResponse.json(await clearWorkspacePlanOverride(id, user.id));
});
