import { NextResponse } from "next/server";
import { z } from "zod";

import { createOrganization, listOrganizationsForUser, organizationNameSchema } from "@/lib/services/organizations";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions, readActiveOrganizationCookie } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

/** Organizations the signed-in user belongs to (works even with none). */
export const GET = withUser(async (_req, user) => {
  const [organizations, activeId] = await Promise.all([listOrganizationsForUser(user.id), readActiveOrganizationCookie()]);
  const active = organizations.find((o) => o.organization.id === activeId) ?? organizations[0] ?? null;
  return NextResponse.json({ organizations, activeOrganizationId: active?.organization.id ?? null });
});

const createSchema = z.object({ name: organizationNameSchema });

/**
 * Creates a separate, separately billed organization owned by the caller, with a
 * first workspace of the same name, and opens it.
 */
export const POST = withUser(async (req, user) => {
  const { name } = await parseBody(req, createSchema);
  const { organization, workspace } = await createOrganization(user.id, { name });
  const res = NextResponse.json({ organization: { id: organization.id, name: organization.name }, workspace: { id: workspace.id } }, { status: 201 });
  res.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organization.id, activeWorkspaceCookieOptions());
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, activeWorkspaceCookieOptions());
  return res;
});
