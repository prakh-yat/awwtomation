/**
 * What an AI app connected over MCP may reach.
 *
 * A grant is one person letting one app into one organization, either every
 * workspace in it (`workspaceIds` empty, which also covers workspaces created
 * later) or a picked list. Nothing is cached: every MCP request resolves the
 * grants against the person's current memberships, so leaving an organization,
 * losing a role or disconnecting the app in Settings applies to the very next
 * call. The app always acts as the person, with the role they hold now.
 */
import type { Organization, User, Workspace, WorkspaceRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { revokeTokensFor } from "@/lib/services/oauth";
import { recordAudit } from "@/lib/services/audit";
import { ApiError } from "@/lib/workspace/api";
import { roleAtLeast } from "@/lib/workspace/permissions";

/** How often a grant's "last used" is written: once per window is plenty for a Settings list. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// ───────────────────────── Consent ─────────────────────────

export type ConsentOrganization = {
  id: string;
  name: string;
  role: WorkspaceRole;
  workspaces: Array<{ id: string; name: string }>;
  /** What this app can already reach here, to start the consent screen from. Null when it has no grant. */
  current: { all: boolean; workspaceIds: string[] } | null;
};

/** The organizations and workspaces the consent screen offers, oldest membership first. */
export async function consentOptions(userId: string, clientId: string): Promise<ConsentOrganization[]> {
  const [memberships, grants] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { organization: { select: { id: true, name: true, workspaces: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } } } } },
    }),
    prisma.oAuthGrant.findMany({ where: { userId, clientId, revokedAt: null }, select: { organizationId: true, workspaceIds: true } }),
  ]);
  const grantByOrg = new Map(grants.map((g) => [g.organizationId, g]));
  return memberships
    .filter((m) => m.organization.workspaces.length > 0)
    .map((m) => {
      const grant = grantByOrg.get(m.organizationId);
      return {
        id: m.organization.id,
        name: m.organization.name,
        role: m.role,
        workspaces: m.organization.workspaces,
        current: grant ? { all: grant.workspaceIds.length === 0, workspaceIds: grant.workspaceIds } : null,
      };
    });
}

export type ConsentSelection = { organizationId: string; all: boolean; workspaceIds: string[] };

/**
 * Stores what the person picked on the consent screen. Consent replaces what
 * the app could reach before: an organization shown on the screen and left
 * unticked loses its grant. Returns how many workspaces the app can now reach.
 */
export async function saveConsent(input: { user: Pick<User, "id">; clientId: string; clientName: string; selections: ConsentSelection[] }): Promise<number> {
  const options = await consentOptions(input.user.id, input.clientId);
  const byId = new Map(input.selections.map((s) => [s.organizationId, s]));
  let reachable = 0;

  for (const org of options) {
    const pick = byId.get(org.id);
    const known = new Set(org.workspaces.map((w) => w.id));
    const workspaceIds = pick && !pick.all ? Array.from(new Set(pick.workspaceIds.filter((id) => known.has(id)))) : [];
    const granted = Boolean(pick && (pick.all || workspaceIds.length > 0));

    if (!granted) {
      if (org.current) {
        await prisma.oAuthGrant.updateMany({
          where: { userId: input.user.id, clientId: input.clientId, organizationId: org.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      continue;
    }

    reachable += pick?.all ? org.workspaces.length : workspaceIds.length;
    await prisma.oAuthGrant.upsert({
      where: { userId_clientId_organizationId: { userId: input.user.id, clientId: input.clientId, organizationId: org.id } },
      create: { userId: input.user.id, clientId: input.clientId, organizationId: org.id, workspaceIds },
      update: { workspaceIds, revokedAt: null },
    });
    await recordAudit({
      userId: input.user.id,
      action: "mcp.app_authorized",
      targetType: "oauth_client",
      targetId: input.clientId,
      metadata: { organizationId: org.id, clientName: input.clientName, workspaces: pick?.all ? "all" : workspaceIds },
    });
  }
  logger.info("mcp.consent_saved", { userId: input.user.id, clientId: input.clientId, reachable });
  return reachable;
}

// ───────────────────────── Serving ─────────────────────────

export type ReachableWorkspace = {
  grantId: string;
  workspace: Workspace;
  organization: Organization;
  role: WorkspaceRole;
  /** Every workspace in the organization, for the context object tools receive. */
  organizationWorkspaces: Array<Pick<Workspace, "id" | "name" | "slug">>;
};

/** The workspaces one app may act in for one person, resolved against their memberships right now. */
export async function reachableWorkspaces(userId: string, clientId: string): Promise<ReachableWorkspace[]> {
  const grants = await prisma.oAuthGrant.findMany({
    where: { userId, clientId, revokedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      organization: {
        include: {
          workspaces: { orderBy: { createdAt: "asc" } },
          members: { where: { userId }, select: { role: true } },
        },
      },
    },
  });

  const out: ReachableWorkspace[] = [];
  for (const grant of grants) {
    const membership = grant.organization.members[0];
    if (!membership) continue;
    const { workspaces, members: _members, ...organization } = grant.organization;
    const allowed = grant.workspaceIds.length === 0 ? workspaces : workspaces.filter((w) => grant.workspaceIds.includes(w.id));
    const organizationWorkspaces = workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug }));
    for (const workspace of allowed) {
      out.push({ grantId: grant.id, workspace, organization, role: membership.role, organizationWorkspaces });
    }
  }
  return out;
}

/** True while the person still lets this app into at least one organization they belong to. */
export async function hasLiveGrant(userId: string, clientId: string): Promise<boolean> {
  const count = await prisma.oAuthGrant.count({
    where: { userId, clientId, revokedAt: null, organization: { members: { some: { userId } } } },
  });
  return count > 0;
}

/** Marks grants as used, at most once per window so a busy session costs no writes. */
export async function touchGrants(grantIds: string[]): Promise<void> {
  if (grantIds.length === 0) return;
  const now = new Date();
  await prisma.oAuthGrant
    .updateMany({
      where: { id: { in: grantIds }, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } }] },
      data: { lastUsedAt: now },
    })
    .catch((err) => logger.warn("mcp.touch_grants_failed", { error: err }));
}

/**
 * A workspace the app itself just created belongs in its grant, or the next
 * call could not reach it. A grant that already covers every workspace needs nothing.
 */
export async function addWorkspaceToGrant(grantId: string, workspaceId: string): Promise<void> {
  const grant = await prisma.oAuthGrant.findUnique({ where: { id: grantId }, select: { workspaceIds: true } });
  if (!grant || grant.workspaceIds.length === 0 || grant.workspaceIds.includes(workspaceId)) return;
  await prisma.oAuthGrant.update({ where: { id: grantId }, data: { workspaceIds: [...grant.workspaceIds, workspaceId] } });
}

// ───────────────────────── Tool access ─────────────────────────

/** organizationId → tool name → the members allowed to use it. A tool that is not listed is open to every member. */
export type ToolAccessMap = Map<string, Map<string, Set<string>>>;

/** The narrowed tools of several organizations, for one MCP request. */
export async function toolAccessFor(organizationIds: string[]): Promise<ToolAccessMap> {
  const map: ToolAccessMap = new Map();
  if (organizationIds.length === 0) return map;
  const rows = await prisma.mcpToolAccess.findMany({
    where: { organizationId: { in: organizationIds } },
    select: { organizationId: true, tool: true, userIds: true },
  });
  for (const row of rows) {
    const tools = map.get(row.organizationId) ?? new Map<string, Set<string>>();
    tools.set(row.tool, new Set(row.userIds));
    map.set(row.organizationId, tools);
  }
  return map;
}

/** tool name → allowed user ids, for the tools the owner has narrowed. Everything else is open to every member. */
export async function listToolAccess(organizationId: string): Promise<Record<string, string[]>> {
  const rows = await prisma.mcpToolAccess.findMany({ where: { organizationId }, select: { tool: true, userIds: true } });
  return Object.fromEntries(rows.map((row) => [row.tool, row.userIds]));
}

/**
 * Sets who may use a tool: `null` opens it to every member again, including
 * people who join later; a list narrows it to those members. The caller
 * checks that the tool exists and that the actor is the owner.
 */
export async function setToolAccess(input: { organizationId: string; actorId: string; tool: string; userIds: string[] | null }): Promise<string[] | null> {
  if (input.userIds === null) {
    await prisma.mcpToolAccess.deleteMany({ where: { organizationId: input.organizationId, tool: input.tool } });
  } else {
    const requested = Array.from(new Set(input.userIds));
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: input.organizationId, userId: { in: requested } },
      select: { userId: true },
    });
    if (members.length !== requested.length) throw new ApiError(422, "Everyone you pick must be a member of this organization.", "NOT_A_MEMBER");
    await prisma.mcpToolAccess.upsert({
      where: { organizationId_tool: { organizationId: input.organizationId, tool: input.tool } },
      create: { organizationId: input.organizationId, tool: input.tool, userIds: requested, updatedById: input.actorId },
      update: { userIds: requested, updatedById: input.actorId },
    });
  }

  await recordAudit({
    userId: input.actorId,
    action: "mcp.tool_access_changed",
    targetType: "mcp_tool",
    targetId: input.tool,
    metadata: { organizationId: input.organizationId, userIds: input.userIds ?? "everyone" },
  });
  return input.userIds === null ? null : Array.from(new Set(input.userIds));
}

// ───────────────────────── Settings ─────────────────────────

export type ConnectedApp = {
  grantId: string;
  clientName: string;
  /** Where the app sends people back to, so two apps with the same name can be told apart. */
  clientHost: string | null;
  user: { id: string; name: string | null; email: string };
  /** Null when the app can reach every workspace in the organization. */
  workspaces: Array<{ id: string; name: string }> | null;
  createdAt: string;
  lastUsedAt: string | null;
};

function hostOf(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}

/**
 * The apps connected to an organization. Members see their own; admins and
 * owners see everyone's, so they can remove an app a teammate connected.
 */
export async function listConnectedApps(organizationId: string, viewer: { userId: string; role: WorkspaceRole }): Promise<ConnectedApp[]> {
  const seeAll = roleAtLeast(viewer.role, "ADMIN");
  const [grants, workspaces] = await Promise.all([
    prisma.oAuthGrant.findMany({
      where: { organizationId, revokedAt: null, ...(seeAll ? {} : { userId: viewer.userId }), user: { memberships: { some: { organizationId } } } },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { clientName: true, redirectUris: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.workspace.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const nameById = new Map(workspaces.map((w) => [w.id, w.name]));
  return grants.map((grant) => ({
    grantId: grant.id,
    clientName: grant.client.clientName,
    clientHost: hostOf(grant.client.redirectUris[0]),
    user: grant.user,
    workspaces:
      grant.workspaceIds.length === 0
        ? null
        : grant.workspaceIds.filter((id) => nameById.has(id)).map((id) => ({ id, name: nameById.get(id) as string })),
    createdAt: grant.createdAt.toISOString(),
    lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
  }));
}

/**
 * Disconnects an app from one organization. Anyone may remove their own;
 * admins and owners may remove anyone's. When the person has no other
 * organization left for this app, its tokens die too, so it cannot even refresh.
 */
export async function revokeGrant(grantId: string, actor: { userId: string; organizationId: string; role: WorkspaceRole }): Promise<void> {
  const grant = await prisma.oAuthGrant.findUnique({
    where: { id: grantId },
    include: { client: { select: { clientName: true } } },
  });
  if (!grant || grant.organizationId !== actor.organizationId || grant.revokedAt) throw new ApiError(404, "That app is not connected", "NOT_FOUND");
  if (grant.userId !== actor.userId && !roleAtLeast(actor.role, "ADMIN")) {
    throw new ApiError(403, "Only admins can disconnect an app someone else connected", "FORBIDDEN");
  }

  await prisma.oAuthGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
  if (!(await hasLiveGrant(grant.userId, grant.clientId))) await revokeTokensFor(grant.userId, grant.clientId);

  await recordAudit({
    userId: actor.userId,
    action: "mcp.app_disconnected",
    targetType: "oauth_client",
    targetId: grant.clientId,
    metadata: { organizationId: grant.organizationId, clientName: grant.client.clientName, connectedBy: grant.userId },
  });
}
