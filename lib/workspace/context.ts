import type { Organization, User, Workspace, WorkspaceRole } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, readActiveOrganizationCookie, readActiveWorkspaceCookie } from "@/lib/workspace/cookie";
import { roleRank } from "@/lib/workspace/permissions";
import { ONBOARDING_PATH, PATHNAME_HEADER } from "@/lib/workspace/request";

export { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, ONBOARDING_PATH };

export type OrganizationSummary = Pick<Organization, "id" | "name" | "slug" | "plan">;

export type WorkspaceSummary = Pick<Workspace, "id" | "name" | "slug">;

export type WorkspaceContext = {
  user: User;
  /** The billable account the active workspace belongs to. */
  organization: Organization;
  workspace: Workspace;
  /** The user's role in `organization`; it applies to every workspace in it. */
  role: WorkspaceRole;
  /** Workspaces in the active organization, oldest first. */
  workspaces: WorkspaceSummary[];
  /** Every organization the user belongs to, oldest membership first. */
  organizations: Array<{ organization: OrganizationSummary; role: WorkspaceRole }>;
};

/** Thrown by `requireRole`: `handleApiError` maps it to a 403 JSON response. */
export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "You don't have permission to do that") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function summarizeOrganization(org: Organization): OrganizationSummary {
  return { id: org.id, name: org.name, slug: org.slug, plan: org.plan };
}

/**
 * Resolves the signed-in user's active organization and workspace.
 *
 * Both cookies are only preferences. The organization cookie is honoured when
 * the user is still a member of it; failing that, the organization of the
 * workspace cookie; failing that, the oldest membership that has a workspace.
 * The workspace cookie is honoured only inside the resolved organization. A
 * stale cookie (removed from a team, deleted workspace) therefore never grants
 * access or produces a broken page.
 *
 * Memoized per request so layouts, pages and nested components can all call it.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    include: { organization: { include: { workspaces: { orderBy: { createdAt: "asc" } } } } },
    orderBy: { createdAt: "asc" },
  });
  const usable = memberships.filter((m) => m.organization.workspaces.length > 0);
  if (usable.length === 0) return null;

  const [preferredOrgId, preferredWorkspaceId] = await Promise.all([readActiveOrganizationCookie(), readActiveWorkspaceCookie()]);
  const active =
    usable.find((m) => m.organizationId === preferredOrgId) ??
    usable.find((m) => m.organization.workspaces.some((w) => w.id === preferredWorkspaceId)) ??
    usable[0];

  const { workspaces, ...organization } = active.organization;
  const workspace = workspaces.find((w) => w.id === preferredWorkspaceId) ?? workspaces[0];

  return {
    user,
    organization,
    workspace,
    role: active.role,
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug })),
    organizations: memberships.map((m) => ({ organization: summarizeOrganization(m.organization), role: m.role })),
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
 * `ONBOARDING_PATH`: calling this guard there would redirect to itself.
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
