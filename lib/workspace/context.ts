import type { User, Workspace, WorkspaceRole } from "@prisma/client";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ACTIVE_WORKSPACE_COOKIE, readActiveWorkspaceCookie } from "@/lib/workspace/cookie";
import { roleRank } from "@/lib/workspace/permissions";
import { ONBOARDING_PATH, PATHNAME_HEADER } from "@/lib/workspace/request";

export { ACTIVE_WORKSPACE_COOKIE, ONBOARDING_PATH };

export type WorkspaceSummary = Pick<Workspace, "id" | "name" | "slug" | "plan">;

export type WorkspaceContext = {
  user: User;
  workspace: Workspace;
  role: WorkspaceRole;
  memberships: Array<{ workspace: WorkspaceSummary; role: WorkspaceRole }>;
  isSuperAdmin: boolean;
};

/** Thrown by `requireRole` — `handleApiError` maps it to a 403 JSON response. */
export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "You don't have permission to do that") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function summarize(workspace: Workspace): WorkspaceSummary {
  return { id: workspace.id, name: workspace.name, slug: workspace.slug, plan: workspace.plan };
}

/**
 * Resolves the signed-in user's active workspace.
 *
 * The `or_workspace` cookie is only a *preference*: it is honoured solely when
 * the user is still a member of that workspace, otherwise we fall back to the
 * oldest membership. This keeps a stale cookie (removed from a team, deleted
 * workspace) from ever granting access or producing a broken page.
 *
 * Memoized per request so layouts, pages and nested components can all call it.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const preferredId = await readActiveWorkspaceCookie();
  const active = memberships.find((m) => m.workspaceId === preferredId) ?? memberships[0];

  return {
    user,
    workspace: active.workspace,
    role: active.role,
    memberships: memberships.map((m) => ({ workspace: summarize(m.workspace), role: m.role })),
    isSuperAdmin: user.isSuperAdmin,
  };
});

/**
 * Pathname of the request being rendered, forwarded by `middleware.ts` as a
 * request header. Null outside the middleware matcher (e.g. static assets).
 * Layouts use it to special-case `/onboarding`, which lives under `app/(app)/`
 * but must render for users who have no workspace yet.
 */
export async function getRequestPathname(): Promise<string | null> {
  const h = await headers();
  return h.get(PATHNAME_HEADER);
}

/**
 * Page/layout guard. Redirects instead of throwing so it can sit at the top
 * of any server component under `app/(app)/`.
 *
 * NOTE for layouts wrapping `/onboarding`: call `getWorkspaceContext()` and
 * render children bare when it is null and `getRequestPathname()` is
 * `ONBOARDING_PATH` — calling this guard there would redirect to itself.
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}

/** Throws `ForbiddenError` when `ctx.role` ranks below `min` (OWNER > ADMIN > MEMBER). */
export function requireRole(ctx: WorkspaceContext, min: WorkspaceRole): void {
  if (roleRank(ctx.role) < roleRank(min)) {
    throw new ForbiddenError(`This action requires the ${min.toLowerCase()} role`);
  }
}

/**
 * Super-admin guard for `/admin/*`. Non-admins get a 404 rather than a 403 so
 * the existence of the panel isn't advertised to regular users.
 */
export async function requireSuperAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (!user.isSuperAdmin) notFound();
  return user;
}
