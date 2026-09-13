import { randomBytes } from "node:crypto";

import type { Organization, Workspace, WorkspaceRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/services/audit";
import { assertOrganizationMembership, getOrganizationMembership, insertWorkspace, workspaceNameSchema } from "@/lib/services/organizations";
import { slugify } from "@/lib/utils";
import { ApiError } from "@/lib/workspace/api";
import { roleAtLeast } from "@/lib/workspace/permissions";

// Audit and naming helpers moved out with organizations; re-exported so existing imports keep working.
export { recordAudit, type AuditInput } from "@/lib/services/audit";
export { defaultWorkspaceName, emailSchema, invitationUrl, workspaceNameSchema, workspaceRoleSchema } from "@/lib/services/organizations";

/**
 * Workspaces are the brands or clients inside an organization. Access comes
 * from organization membership: anyone in the organization can open every
 * workspace in it, with their organization role.
 */

// ───────────────────────── Validation ─────────────────────────

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidTimezone, "Unknown IANA timezone (e.g. Asia/Kathmandu)");

export const updateWorkspaceSchema = z
  .object({
    name: workspaceNameSchema.optional(),
    timezone: timezoneSchema.optional(),
    onboardedAt: z.coerce.date().nullable().optional(),
  })
  .strict();

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

// ───────────────────────── Types ─────────────────────────

export type WorkspaceSummary = Pick<Workspace, "id" | "name" | "slug">;

export type WorkspaceAccess = { workspace: Workspace & { organization: Organization }; role: WorkspaceRole };

// ───────────────────────── Access ─────────────────────────

/**
 * Loads a workspace the user can open, with their organization role. Scoped by
 * membership of the workspace's own organization, never by the active cookie.
 * A workspace the user can't reach is reported as not found.
 */
export async function assertMembership(workspaceId: string, userId: string, minRole: WorkspaceRole = "MEMBER"): Promise<WorkspaceAccess> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, include: { organization: true } });
  if (!workspace) throw new ApiError(404, "Workspace not found", "NOT_FOUND");
  const membership = await getOrganizationMembership(workspace.organizationId, userId);
  if (!membership) throw new ApiError(404, "Workspace not found", "NOT_FOUND");
  if (!roleAtLeast(membership.role, minRole)) {
    throw new ApiError(403, `This action requires the ${minRole.toLowerCase()} role`, "FORBIDDEN");
  }
  return { workspace, role: membership.role };
}

// ───────────────────────── Workspaces ─────────────────────────

/**
 * Adds a workspace to an organization (ADMIN+). Slugs derive from the name; on
 * collision we append a short random suffix rather than a counter so the
 * check-then-insert race can't produce duplicates (the unique index is the real
 * guard — we retry on P2002).
 */
export async function createWorkspace(organizationId: string, actorId: string, name: string): Promise<Workspace> {
  await assertOrganizationMembership(organizationId, actorId, "ADMIN");
  const cleanName = workspaceNameSchema.parse(name);
  const base = slugify(cleanName);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const taken = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (taken) continue;

    try {
      const workspace = await prisma.$transaction((tx) => insertWorkspace(tx, { organizationId, name: cleanName, slug }));
      await recordAudit({
        workspaceId: workspace.id,
        userId: actorId,
        action: "workspace.created",
        targetType: "workspace",
        targetId: workspace.id,
        metadata: { organizationId, name: cleanName, slug },
      });
      logger.info("workspace.created", { workspaceId: workspace.id, organizationId, actorId, slug });
      return workspace;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new ApiError(500, "Could not allocate a unique workspace URL, please try again", "SLUG_EXHAUSTED");
}

export async function updateWorkspace(workspaceId: string, data: UpdateWorkspaceInput, actorId?: string): Promise<Workspace> {
  const clean = updateWorkspaceSchema.parse(data);
  const workspace = await prisma.workspace.update({ where: { id: workspaceId }, data: clean });
  await recordAudit({
    workspaceId,
    userId: actorId ?? null,
    action: "workspace.updated",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { fields: Object.keys(clean) },
  });
  return workspace;
}

export async function getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
  return prisma.workspace.findUnique({ where: { id: workspaceId } });
}

/** Workspaces in an organization with the numbers the workspace list shows. */
export async function listWorkspaces(organizationId: string) {
  return prisma.workspace.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: { select: { channels: true, automations: true, contacts: true } },
    },
  });
}

/**
 * Validates access and returns the workspace and its organization so the
 * route can point both cookies at them (switching workspace can also mean
 * switching organization when opened from a link).
 */
export async function switchWorkspace(userId: string, workspaceId: string): Promise<WorkspaceAccess> {
  try {
    return await assertMembership(workspaceId, userId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw new ApiError(403, "You're not a member of that workspace", "NOT_A_MEMBER");
    throw err;
  }
}

/**
 * OWNER only. An organization always keeps at least one workspace; delete the
 * organization instead. Relies on `onDelete: Cascade` to remove tenant data.
 */
export async function deleteWorkspace(workspaceId: string, actorId: string): Promise<void> {
  const { workspace } = await assertMembership(workspaceId, actorId, "OWNER");
  const siblings = await prisma.workspace.count({ where: { organizationId: workspace.organizationId } });
  if (siblings <= 1) {
    throw new ApiError(409, "This is the organization's only workspace. Delete the organization instead.", "LAST_WORKSPACE");
  }
  await prisma.workspace.delete({ where: { id: workspaceId } });
  // The workspace row is gone (and cascades would take the log with it), so
  // this entry is intentionally unscoped and carries the identity in metadata.
  await recordAudit({
    workspaceId: null,
    userId: actorId,
    action: "workspace.deleted",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { organizationId: workspace.organizationId, name: workspace.name, slug: workspace.slug },
  });
  logger.info("workspace.deleted", { workspaceId, actorId });
}
