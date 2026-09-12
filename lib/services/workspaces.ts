import { randomBytes } from "node:crypto";

import type { InvitationStatus, User, Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { effectivePlan } from "@/lib/billing/entitlements";
import { checkLimit } from "@/lib/billing/usage";
import { limitsFor } from "@/lib/billing/plans";
import { randomToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { slugify } from "@/lib/utils";
import { ApiError } from "@/lib/workspace/api";
import { setActiveWorkspaceCookie } from "@/lib/workspace/cookie";
import { canAssignRole, roleAtLeast, roleRank } from "@/lib/workspace/permissions";

// ───────────────────────── Validation ─────────────────────────

export const workspaceNameSchema = z
  .string({ required_error: "Give your workspace a name" })
  .trim()
  .min(2, "Workspace name must be at least 2 characters")
  .max(60, "Workspace name must be 60 characters or fewer");

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

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

// ───────────────────────── Types ─────────────────────────

export type WorkspaceSummary = Pick<Workspace, "id" | "name" | "slug" | "plan">;

export type UserSummary = Pick<User, "id" | "email" | "name" | "avatarUrl">;

export type MemberWithUser = WorkspaceMember & { user: UserSummary };

export type MembershipWithWorkspace = WorkspaceMember & { workspace: Workspace };

export type InvitationSummary = Pick<WorkspaceInvitation, "id" | "email" | "role" | "status" | "expiresAt" | "createdAt"> & {
  invitedBy: Pick<User, "id" | "name" | "email"> | null;
  /** Derived: PENDING but past `expiresAt`. */
  expired: boolean;
  /** Only populated when the caller may share the link (ADMIN+). */
  inviteUrl?: string;
};

export type InvitationState = "VALID" | "EXPIRED" | "REVOKED" | "ACCEPTED" | "EMAIL_MISMATCH";

export type AuditInput = {
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ───────────────────────── Helpers ─────────────────────────

/**
 * Audit writes must never break the action they describe, so failures are
 * logged and swallowed. Call it *after* the transaction that made the change.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (err) {
    logger.warn("audit.write_failed", { action: input.action, workspaceId: input.workspaceId, error: err });
  }
}

export function invitationUrl(token: string): string {
  return appUrl(`/invite/${token}`);
}

function isUniqueViolation(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : typeof target === "string" && target.includes(field);
}

function memberLimitError(limit: number): ApiError {
  return new ApiError(
    403,
    `Your plan allows ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to add more.`,
    "PLAN_LIMIT",
  );
}

/** Loads the membership row (with workspace) or null. Scoped by both ids — never trust a bare workspace id. */
export async function getMembership(workspaceId: string, userId: string): Promise<MembershipWithWorkspace | null> {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
}

/**
 * Authorisation primitive for everything below and for `/api/workspaces/[id]`
 * routes. A non-member gets 404 (not 403) so we don't confirm which workspace
 * ids exist.
 */
export async function assertMembership(
  workspaceId: string,
  userId: string,
  minRole: WorkspaceRole = "MEMBER",
): Promise<MembershipWithWorkspace> {
  const membership = await getMembership(workspaceId, userId);
  if (!membership) throw new ApiError(404, "Workspace not found", "NOT_FOUND");
  if (!roleAtLeast(membership.role, minRole)) {
    throw new ApiError(403, `This action requires the ${minRole.toLowerCase()} role`, "FORBIDDEN");
  }
  return membership;
}

// ───────────────────────── Workspaces ─────────────────────────

/**
 * Creates a workspace and makes `userId` its OWNER. Slugs derive from the
 * name; on collision we append a short random suffix rather than a counter so
 * the check-then-insert race can't produce duplicates (the unique index is
 * the real guard — we retry on P2002).
 */
export async function createWorkspace(userId: string, name: string): Promise<Workspace> {
  const cleanName = workspaceNameSchema.parse(name);
  const base = slugify(cleanName);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const taken = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (taken) continue;

    try {
      const workspace = await prisma.$transaction(async (tx) => {
        const ws = await tx.workspace.create({ data: { name: cleanName, slug } });
        await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId, role: "OWNER" } });
        return ws;
      });
      await recordAudit({
        workspaceId: workspace.id,
        userId,
        action: "workspace.created",
        targetType: "workspace",
        targetId: workspace.id,
        metadata: { name: cleanName, slug },
      });
      logger.info("workspace.created", { workspaceId: workspace.id, userId, slug });
      return workspace;
    } catch (err) {
      if (isUniqueViolation(err, "slug")) continue;
      throw err;
    }
  }
  throw new ApiError(500, "Could not allocate a unique workspace URL, please try again", "SLUG_EXHAUSTED");
}

export async function updateWorkspace(
  workspaceId: string,
  data: UpdateWorkspaceInput,
  actorId?: string,
): Promise<Workspace> {
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

export async function listWorkspacesForUser(
  userId: string,
): Promise<Array<{ workspace: WorkspaceSummary; role: WorkspaceRole; joinedAt: Date }>> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, name: true, slug: true, plan: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ workspace: m.workspace, role: m.role, joinedAt: m.createdAt }));
}

/**
 * Validates membership and persists the choice in the `or_workspace` cookie.
 * Only callable from a Route Handler or Server Action (cookies are written).
 */
export async function switchWorkspace(
  userId: string,
  workspaceId: string,
): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  const membership = await getMembership(workspaceId, userId);
  if (!membership) throw new ApiError(403, "You're not a member of that workspace", "NOT_A_MEMBER");
  await setActiveWorkspaceCookie(workspaceId);
  return { workspace: membership.workspace, role: membership.role };
}

/** OWNER only. Relies on `onDelete: Cascade` to remove all tenant data. */
export async function deleteWorkspace(workspaceId: string, actorId: string): Promise<void> {
  const membership = await assertMembership(workspaceId, actorId, "OWNER");
  await prisma.workspace.delete({ where: { id: workspaceId } });
  // The workspace row is gone (and cascades would take the log with it), so
  // this entry is intentionally unscoped and carries the identity in metadata.
  await recordAudit({
    workspaceId: null,
    userId: actorId,
    action: "workspace.deleted",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { name: membership.workspace.name, slug: membership.workspace.slug },
  });
  logger.info("workspace.deleted", { workspaceId, actorId });
}

/** "Vikas's workspace" — first name from Google, else the email local part. */
export function defaultWorkspaceName(user: Pick<User, "name" | "email">): string {
  const source = user.name?.trim().split(/\s+/)[0] || user.email.split("@")[0] || "My";
  const first = source.charAt(0).toUpperCase() + source.slice(1);
  return `${first.slice(0, 40)}'s workspace`;
}

/**
 * First-login bootstrap: every user gets a personal workspace so the app
 * never renders empty. Idempotent — returns the oldest membership if any.
 */
export async function ensureDefaultWorkspace(
  user: Pick<User, "id" | "name" | "email">,
): Promise<{ workspace: Workspace; created: boolean }> {
  const existing = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { workspace: existing.workspace, created: false };

  const workspace = await createWorkspace(user.id, defaultWorkspaceName(user));
  return { workspace, created: true };
}

// ───────────────────────── Members ─────────────────────────

const userSummarySelect = { id: true, email: true, name: true, avatarUrl: true } as const;

export async function listMembers(workspaceId: string): Promise<MemberWithUser[]> {
  // Enum order in the schema is OWNER, ADMIN, MEMBER — ascending puts owners first.
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: userSummarySelect } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

async function countOwners(workspaceId: string): Promise<number> {
  return prisma.workspaceMember.count({ where: { workspaceId, role: "OWNER" } });
}

/** OWNER only. Promoting to a second OWNER is allowed; demoting the last one is not. */
export async function updateMemberRole(
  workspaceId: string,
  actorId: string,
  targetUserId: string,
  role: WorkspaceRole,
): Promise<MemberWithUser> {
  await assertMembership(workspaceId, actorId, "OWNER");
  const cleanRole = workspaceRoleSchema.parse(role);

  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    include: { user: { select: userSummarySelect } },
  });
  if (!target) throw new ApiError(404, "Member not found", "NOT_FOUND");
  if (target.role === cleanRole) return target;

  if (target.role === "OWNER" && (await countOwners(workspaceId)) <= 1) {
    throw new ApiError(409, "A workspace needs at least one owner. Transfer ownership first.", "LAST_OWNER");
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: target.id },
    data: { role: cleanRole },
    include: { user: { select: userSummarySelect } },
  });
  await recordAudit({
    workspaceId,
    userId: actorId,
    action: "member.role_changed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { from: target.role, to: cleanRole },
  });
  return updated;
}

/**
 * Removes a member. Anyone may remove themselves (leave); otherwise the actor
 * must be ADMIN+ and outrank the target, except OWNERs who may remove anyone.
 * The last OWNER can never be removed — transfer ownership first.
 */
export async function removeMember(workspaceId: string, actorId: string, targetUserId: string): Promise<void> {
  const actor = await assertMembership(workspaceId, actorId, "MEMBER");
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new ApiError(404, "Member not found", "NOT_FOUND");

  const isSelf = actorId === targetUserId;
  if (!isSelf) {
    if (!roleAtLeast(actor.role, "ADMIN")) {
      throw new ApiError(403, "Only admins can remove team members", "FORBIDDEN");
    }
    if (actor.role !== "OWNER" && roleRank(target.role) >= roleRank(actor.role)) {
      throw new ApiError(403, "You can only remove members with a lower role than yours", "FORBIDDEN");
    }
  }
  if (target.role === "OWNER" && (await countOwners(workspaceId)) <= 1) {
    throw new ApiError(409, "A workspace needs at least one owner. Transfer ownership first.", "LAST_OWNER");
  }

  await prisma.workspaceMember.delete({ where: { id: target.id } });
  await recordAudit({
    workspaceId,
    userId: actorId,
    action: isSelf ? "member.left" : "member.removed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { role: target.role },
  });
}

/** OWNER only. The previous owner stays on as ADMIN so nobody is locked out mid-handover. */
export async function transferOwnership(workspaceId: string, actorId: string, targetUserId: string): Promise<void> {
  const actor = await assertMembership(workspaceId, actorId, "OWNER");
  if (actorId === targetUserId) throw new ApiError(422, "You already own this workspace", "ALREADY_OWNER");

  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new ApiError(404, "Member not found", "NOT_FOUND");

  await prisma.$transaction([
    prisma.workspaceMember.update({ where: { id: target.id }, data: { role: "OWNER" } }),
    prisma.workspaceMember.update({ where: { id: actor.id }, data: { role: "ADMIN" } }),
  ]);
  await recordAudit({
    workspaceId,
    userId: actorId,
    action: "workspace.ownership_transferred",
    targetType: "user",
    targetId: targetUserId,
    metadata: { previousOwnerId: actorId },
  });
  logger.info("workspace.ownership_transferred", { workspaceId, from: actorId, to: targetUserId });
}

// ───────────────────────── Invitations ─────────────────────────

/**
 * Creates a 7-day invite link. Any earlier pending invite for the same
 * address is revoked first so exactly one live link exists per person.
 */
export async function inviteMember(
  workspaceId: string,
  inviterId: string,
  email: string,
  role: WorkspaceRole,
): Promise<WorkspaceInvitation> {
  const inviter = await assertMembership(workspaceId, inviterId, "ADMIN");
  const cleanEmail = emailSchema.parse(email);
  const cleanRole = workspaceRoleSchema.parse(role);
  if (!canAssignRole(inviter.role, cleanRole)) {
    throw new ApiError(403, "Only the owner can invite another owner", "FORBIDDEN");
  }

  const alreadyMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, user: { email: cleanEmail } },
    select: { id: true },
  });
  if (alreadyMember) throw new ApiError(409, "That person is already a member of this workspace", "ALREADY_MEMBER");

  await prisma.workspaceInvitation.updateMany({
    where: { workspaceId, email: cleanEmail, status: "PENDING" },
    data: { status: "REVOKED" },
  });

  const seats = await checkLimit(workspaceId, "members");
  if (!seats.ok) throw memberLimitError(seats.limit);

  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      email: cleanEmail,
      role: cleanRole,
      token: randomToken(32),
      invitedById: inviterId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
  });
  await recordAudit({
    workspaceId,
    userId: inviterId,
    action: "invitation.created",
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { email: cleanEmail, role: cleanRole },
  });
  return invitation;
}

export async function getInvitationByToken(token: string) {
  if (!token || token.length > 128) return null;
  return prisma.workspaceInvitation.findUnique({
    where: { token },
    include: {
      workspace: { select: { id: true, name: true, slug: true, plan: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

/** Pure state check shared by the invite page and `acceptInvitation`. */
export function invitationState(
  invitation: Pick<WorkspaceInvitation, "status" | "expiresAt" | "email">,
  userEmail: string,
  now = new Date(),
): InvitationState {
  if (invitation.status === "REVOKED") return "REVOKED";
  if (invitation.status === "ACCEPTED") return "ACCEPTED";
  if (invitation.expiresAt <= now) return "EXPIRED";
  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) return "EMAIL_MISMATCH";
  return "VALID";
}

/**
 * Turns a pending invitation into a membership. Idempotent for users who are
 * already members. The seat limit is re-checked here because the plan may have
 * been downgraded between invite and accept.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(401, "Sign in to accept this invitation", "UNAUTHORIZED");

  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token }, include: { workspace: true } });
  if (!invitation) throw new ApiError(404, "This invitation link is invalid", "INVITE_NOT_FOUND");

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
  });

  const state = invitationState(invitation, user.email);
  if (state === "ACCEPTED" && existing) return { workspace: invitation.workspace, role: existing.role };
  if (state === "ACCEPTED") throw new ApiError(410, "This invitation has already been used", "INVITE_USED");
  if (state === "REVOKED") throw new ApiError(410, "This invitation was revoked", "INVITE_REVOKED");
  if (state === "EXPIRED") throw new ApiError(410, "This invitation has expired. Ask for a new link.", "INVITE_EXPIRED");
  if (state === "EMAIL_MISMATCH") {
    throw new ApiError(403, `This invitation was sent to ${invitation.email}`, "INVITE_EMAIL_MISMATCH");
  }

  if (existing) {
    await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
    return { workspace: invitation.workspace, role: existing.role };
  }

  const limit = limitsFor(effectivePlan(invitation.workspace)).members;
  const memberCount = await prisma.workspaceMember.count({ where: { workspaceId: invitation.workspaceId } });
  if (memberCount >= limit) throw memberLimitError(limit);

  const [member] = await prisma.$transaction([
    prisma.workspaceMember.create({ data: { workspaceId: invitation.workspaceId, userId, role: invitation.role } }),
    prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } }),
  ]);
  await recordAudit({
    workspaceId: invitation.workspaceId,
    userId,
    action: "invitation.accepted",
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { role: invitation.role, invitedById: invitation.invitedById },
  });
  logger.info("invitation.accepted", { workspaceId: invitation.workspaceId, userId, role: member.role });
  return { workspace: invitation.workspace, role: member.role };
}

export async function revokeInvitation(workspaceId: string, invitationId: string, actorId: string): Promise<void> {
  await assertMembership(workspaceId, actorId, "ADMIN");
  const result = await prisma.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  if (result.count === 0) throw new ApiError(404, "Invitation not found or no longer pending", "NOT_FOUND");
  await recordAudit({
    workspaceId,
    userId: actorId,
    action: "invitation.revoked",
    targetType: "invitation",
    targetId: invitationId,
  });
}

export async function listInvitations(
  workspaceId: string,
  opts: { status?: InvitationStatus; includeLinks?: boolean } = {},
): Promise<InvitationSummary[]> {
  const rows = await prisma.workspaceInvitation.findMany({
    where: { workspaceId, status: opts.status ?? "PENDING" },
    include: { invitedBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    invitedBy: row.invitedBy,
    expired: row.status === "PENDING" && row.expiresAt <= now,
    ...(opts.includeLinks ? { inviteUrl: invitationUrl(row.token) } : {}),
  }));
}
