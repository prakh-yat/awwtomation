import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteOrganization, organizationNameSchema, renameOrganization } from "@/lib/services/organizations";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, readActiveOrganizationCookie } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

type Params = { id: string };

const renameSchema = z.object({ name: organizationNameSchema }).strict();

/** ADMIN+ may rename the organization. */
export const PATCH = withUser<Params>(async (req, user, { params }) => {
  const { id } = await params;
  const { name } = await parseBody(req, renameSchema);
  const organization = await renameOrganization(id, user.id, name);
  return NextResponse.json({ organization: { id: organization.id, name: organization.name } });
});

/** OWNER only, and only once no subscription is still charging. Deletes every workspace inside. */
export const DELETE = withUser<Params>(async (_req, user, { params }) => {
  const { id } = await params;
  await deleteOrganization(id, user.id);
  const res = NextResponse.json({ ok: true });
  if ((await readActiveOrganizationCookie()) === id) {
    res.cookies.set(ACTIVE_ORGANIZATION_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
});
