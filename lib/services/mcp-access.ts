/**
 * What an AI app connected over MCP may reach.
 *
 * A grant is one person letting one app into one organization, either every
 * workspace in it (`workspaceIds` empty, which also covers workspaces created
 * later) or a picked list. Nothing is cached: every MCP request resolves the
 * grants against the person's current memberships, so leaving an organization,
 * losing a role or the owner turning a tool off applies to the very next call.
 * The app always acts as the person, with the role they hold now.
 */
import type { Organization, User, Workspace, WorkspaceRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/services/audit";
import { ApiError } from "@/lib/workspace/api";

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

/** Who may use one tool in one organization, as the owner set it. */
export type ToolRule = { allMembers: boolean; userIds: Set<string> };

/** organizationId → tool name → the owner's rule. A tool without a rule follows its default. */
export type ToolAccessMap = Map<string, Map<string, ToolRule>>;

/**
 * Before the owner says otherwise, a tool that only reads is open to every
 * member and a tool that changes something is for owners only. Roles apply on
 * top either way.
 */
export function defaultOpensToEveryone(readOnly: boolean): boolean {
  return readOnly;
}

/** The owner's rules for several organizations, for one MCP request. */
export async function toolAccessFor(organizationIds: string[]): Promise<ToolAccessMap> {
  const map: ToolAccessMap = new Map();
  if (organizationIds.length === 0) return map;
  const rows = await prisma.mcpToolAccess.findMany({
    where: { organizationId: { in: organizationIds } },
    select: { organizationId: true, tool: true, allMembers: true, userIds: true },
  });
  for (const row of rows) {
    const tools = map.get(row.organizationId) ?? new Map<string, ToolRule>();
    tools.set(row.tool, { allMembers: row.allMembers, userIds: new Set(row.userIds) });
    map.set(row.organizationId, tools);
  }
  return map;
}

export type ToolAccessSetting = { everyone: boolean; userIds: string[] };

/** The tools whose access the owner has set, by name. Every other tool follows its default. */
export async function listToolAccess(organizationId: string): Promise<Record<string, ToolAccessSetting>> {
  const rows = await prisma.mcpToolAccess.findMany({ where: { organizationId }, select: { tool: true, allMembers: true, userIds: true } });
  return Object.fromEntries(rows.map((row) => [row.tool, { everyone: row.allMembers, userIds: row.userIds }]));
}

/**
 * Sets who may use a tool: `everyone` opens it to every member, including
 * people who join later; otherwise exactly `userIds`. A read-only tool opened
 * to everyone is back at its default, so its row goes. The caller checks that
 * the tool exists and that the actor is the owner.
 */
export async function setToolAccess(input: {
  organizationId: string;
  actorId: string;
  tool: string;
  readOnly: boolean;
  everyone: boolean;
  userIds: string[];
}): Promise<ToolAccessSetting | null> {
  const where = { organizationId_tool: { organizationId: input.organizationId, tool: input.tool } };
  let saved: ToolAccessSetting | null;

  if (input.everyone && defaultOpensToEveryone(input.readOnly)) {
    await prisma.mcpToolAccess.deleteMany({ where: { organizationId: input.organizationId, tool: input.tool } });
    saved = null;
  } else if (input.everyone) {
    await prisma.mcpToolAccess.upsert({
      where,
      create: { organizationId: input.organizationId, tool: input.tool, allMembers: true, userIds: [], updatedById: input.actorId },
      update: { allMembers: true, userIds: [], updatedById: input.actorId },
    });
    saved = { everyone: true, userIds: [] };
  } else {
    const requested = Array.from(new Set(input.userIds));
    const members = await prisma.organizationMember.count({ where: { organizationId: input.organizationId, userId: { in: requested } } });
    if (members !== requested.length) throw new ApiError(422, "Everyone you pick must be a member of this organization.", "NOT_A_MEMBER");
    await prisma.mcpToolAccess.upsert({
      where,
      create: { organizationId: input.organizationId, tool: input.tool, allMembers: false, userIds: requested, updatedById: input.actorId },
      update: { allMembers: false, userIds: requested, updatedById: input.actorId },
    });
    saved = { everyone: false, userIds: requested };
  }

  await recordAudit({
    userId: input.actorId,
    action: "mcp.tool_access_changed",
    targetType: "mcp_tool",
    targetId: input.tool,
    metadata: { organizationId: input.organizationId, access: saved ? (saved.everyone ? "everyone" : saved.userIds) : "default" },
  });
  return saved;
}
