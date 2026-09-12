import { NextResponse } from "next/server";
import { z } from "zod";

import { createWorkspace, listWorkspacesForUser, workspaceNameSchema } from "@/lib/services/workspaces";
import { parseBody, withUser } from "@/lib/workspace/api";
import { readActiveWorkspaceCookie, setActiveWorkspaceCookie } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

/** Workspaces the signed-in user belongs to (works even with zero memberships). */
export const GET = withUser(async (_req, user) => {
  const [workspaces, activeId] = await Promise.all([listWorkspacesForUser(user.id), readActiveWorkspaceCookie()]);
  const active = workspaces.find((w) => w.workspace.id === activeId) ?? workspaces[0] ?? null;
  return NextResponse.json({ workspaces, activeWorkspaceId: active?.workspace.id ?? null });
});

const createSchema = z.object({ name: workspaceNameSchema });

/** Creates a workspace owned by the caller and makes it the active one. */
export const POST = withUser(async (req, user) => {
  const { name } = await parseBody(req, createSchema);
  const workspace = await createWorkspace(user.id, name);
  await setActiveWorkspaceCookie(workspace.id);
  return NextResponse.json({ workspace, role: "OWNER" }, { status: 201 });
});
