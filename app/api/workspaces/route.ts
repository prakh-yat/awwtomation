import { NextResponse } from "next/server";
import { z } from "zod";

import { createWorkspace, listWorkspaces, workspaceNameSchema } from "@/lib/services/workspaces";
import { parseBody, withWorkspace } from "@/lib/workspace/api";
import { ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions } from "@/lib/workspace/cookie";

export const runtime = "nodejs";

/** Workspaces in the active organization. */
export const GET = withWorkspace(async (_req, ctx) => {
  const workspaces = await listWorkspaces(ctx.organization.id);
  return NextResponse.json({ workspaces, activeWorkspaceId: ctx.workspace.id });
});

const createSchema = z.object({ name: workspaceNameSchema });

/** Adds a workspace to the active organization (admins and owners) and opens it. */
export const POST = withWorkspace(
  async (req, ctx) => {
    const { name } = await parseBody(req, createSchema);
    const workspace = await createWorkspace(ctx.organization.id, ctx.user.id, name);
    const res = NextResponse.json({ workspace }, { status: 201 });
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, activeWorkspaceCookieOptions());
    return res;
  },
  { minRole: "ADMIN" },
);
