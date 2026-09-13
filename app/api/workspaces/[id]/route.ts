import { NextResponse } from "next/server";

import { assertMembership, deleteWorkspace, updateWorkspace, updateWorkspaceSchema } from "@/lib/services/workspaces";
import { parseBody, withUser } from "@/lib/workspace/api";
import { ACTIVE_WORKSPACE_COOKIE, readActiveWorkspaceCookie } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

type Params = { id: string };

/** Workspace details for anyone in its organization. */
export const GET = withUser<Params>(async (_req, user, { params }) => {
  const { id } = await params;
  const { workspace, role } = await assertMembership(id, user.id, "MEMBER");
  return NextResponse.json({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, timezone: workspace.timezone }, role });
});

/** ADMIN+ may rename / change timezone / mark onboarding complete. */
export const PATCH = withUser<Params>(async (req, user, { params }) => {
  const { id } = await params;
  await assertMembership(id, user.id, "ADMIN");
  const data = await parseBody(req, updateWorkspaceSchema);
  const workspace = await updateWorkspace(id, data, user.id);
  return NextResponse.json({ workspace });
});

/** OWNER only, and never the organization's last workspace. Clears the active cookie if it pointed here. */
export const DELETE = withUser<Params>(async (_req, user, { params }) => {
  const { id } = await params;
  await deleteWorkspace(id, user.id);

  const res = NextResponse.json({ ok: true });
  if ((await readActiveWorkspaceCookie()) === id) {
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
});
