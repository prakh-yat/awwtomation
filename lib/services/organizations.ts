import { randomBytes } from "node:crypto";

import type { Invitation, InvitationStatus, Organization, OrganizationMember, PlanTier, User, Workspace, WorkspaceRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { BILLING_FIELDS_SELECT, effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { checkOrganizationLimit } from "@/lib/billing/usage";
import { randomToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DEFAULT_PIPELINE_NAME, DEFAULT_STAGES } from "@/lib/pipelines/colors";
import { recordAudit } from "@/lib/services/audit";
import { slugify } from "@/lib/utils";
import { ApiError } from "@/lib/workspace/api";
import { canAssignRole, roleAtLeast, roleRank } from "@/lib/workspace/permissions";

/**
 * Organizations are the billable tenant: plan, DM allowance, team and payments
 * live here, and every workspace inside shares them. A person can belong to
 * several organizations (their own, a client's, an employer's) and switch
 * between them from the account menu.
 */

// ───────────────────────── Validation ─────────────────────────

export const organizationNameSchema = z
  .string({ required_error: "Give your organization a name" })
  .trim()
  .min(2, "Organization name must be at least 2 characters")
  .max(60, "Organization name must be 60 characters or fewer");

export const workspaceNameSchema = z
  .string({ required_error: "Give your workspace a name" })
  .trim()
  .min(2, "Workspace name must be at least 2 characters")
  .max(60, "Workspace name must be 60 characters or fewer");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

/**
 * Every new organization starts with no plan, which still holds a connected
 * account, automations and contacts; without a cap one person could keep
 * unlimited of them. Invited memberships don't count, only owned ones.
 */
export const MAX_OWNED_ORGANIZATIONS = 10;

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ───────────────────────── Types ─────────────────────────

export type UserSummary = Pick<User, "id" | "email" | "name" | "avatarUrl">;

export type MemberWithUser = OrganizationMember & { user: UserSummary };

export type MembershipWithOrganization = OrganizationMember & { organization: Organization };

export type OrganizationListItem = {
  organization: { id: string; name: string; slug: string; plan: PlanTier };
  role: WorkspaceRole;
  workspaceCount: number;
  joinedAt: Date;
};

export type InvitationSummary = Pick<Invitation, "id" | "email" | "role" | "status" | "expiresAt" | "createdAt"> & {
  invitedBy: Pick<User, "id" | "name" | "email"> | null;
  /** Derived: PENDING but past `expiresAt`. */
  expired: boolean;
  /** Only populated when the caller may share the link (ADMIN+). */
  inviteUrl?: string;
};

export type InvitationState = "VALID" | "EXPIRED" | "REVOKED" | "ACCEPTED" | "EMAIL_MISMATCH";

// ───────────────────────── Helpers ─────────────────────────

export function invitationUrl(token: string): string {
  return appUrl(`/invite/${token}`);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function slugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
}

function memberLimitError(limit: number): ApiError {
  return new ApiError(403, `Your plan allows ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to add more.`, "PLAN_LIMIT");
}

/** "Vikas's organization": first name from Google, else the email local part. */
export function defaultOrganizationName(user: Pick<User, "name" | "email">): string {
  return `${firstName(user)}'s organization`;
}

/** "Vikas's workspace". */
export function defaultWorkspaceName(user: Pick<User, "name" | "email">): string {
  return `${firstName(user)}'s workspace`;
}

function firstName(user: Pick<User, "name" | "email">): string {
  const source = user.name?.trim().split(/\s+/)[0] || user.email.split("@")[0] || "My";
  return (source.charAt(0).toUpperCase() + source.slice(1)).slice(0, 40);
}

/**
 * Creates a workspace row with its starter pipeline inside an open
 * transaction. Callers own slug allocation (and the retry on a clash).
 */
export async function insertWorkspace(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; name: string; slug: string; timezone?: string },
): Promise<Workspace> {
  const workspace = await tx.workspace.create({
    data: { organizationId: input.organizationId, name: input.name, slug: input.slug, ...(input.timezone ? { timezone: input.timezone } : {}) },
  });
  await tx.pipeline.create({
    data: {
      workspaceId: workspace.id,
      name: DEFAULT_PIPELINE_NAME,
      position: 0,
      stages: { create: DEFAULT_STAGES.map((stage, position) => ({ name: stage.name, color: stage.color, position })) },
    },
  });
  return workspace;
}

// ───────────────────────── Membership ─────────────────────────

export async function getOrganizationMembership(organizationId: string, userId: string): Promise<MembershipWithOrganization | null> {
  return prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
}

/**
 * Authorisation primitive for organization-scoped actions. A non-member gets
 * 404 (not 403) so we don't confirm which organization ids exist.
 */
export async function assertOrganizationMembership(
  organizationId: string,
  userId: string,
  minRole: WorkspaceRole = "MEMBER",
): Promise<MembershipWithOrganization> {
  const membership = await getOrganizationMembership(organizationId, userId);
  if (!membership) throw new ApiError(404, "Organization not found", "NOT_FOUND");
  if (!roleAtLeast(membership.role, minRole)) {
    throw new ApiError(403, `This action requires the ${minRole.toLowerCase()} role`, "FORBIDDEN");
  }
  return membership;
}

// ───────────────────────── Organizations ─────────────────────────

/**
 * Creates an organization owned by `userId` with a first workspace inside it.
 * The workspace takes the organization's name unless one is given.
 */
export async function createOrganization(
  userId: string,
  input: { name: string; workspaceName?: string },
): Promise<{ organization: Organization; workspace: Workspace }> {
  const name = organizationNameSchema.parse(input.name);
  const workspaceName = workspaceNameSchema.parse(input.workspaceName ?? name);

  const owned = await prisma.organizationMember.count({ where: { userId, role: "OWNER" } });
  if (owned >= MAX_OWNED_ORGANIZATIONS) {
    throw new ApiError(422, `You can own up to ${MAX_OWNED_ORGANIZATIONS} organizations. Contact support if you need more.`, "ORGANIZATION_LIMIT");
  }

  const orgBase = slugify(name);
  const workspaceBase = slugify(workspaceName);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({ data: { name, slug: slugCandidate(orgBase, attempt) } });
        await tx.organizationMember.create({ data: { organizationId: organization.id, userId, role: "OWNER" } });
        const workspace = await insertWorkspace(tx, { organizationId: organization.id, name: workspaceName, slug: slugCandidate(workspaceBase, attempt) });
        return { organization, workspace };
      });
      await recordAudit({
        workspaceId: result.workspace.id,
        userId,
        action: "organization.created",
        targetType: "organization",
        targetId: result.organization.id,
        metadata: { name },
      });
      logger.info("organization.created", { organizationId: result.organization.id, workspaceId: result.workspace.id, userId });
      return result;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new ApiError(500, "Could not create the organization, please try again", "SLUG_EXHAUSTED");
}

/**
 * First-login bootstrap: every user gets an organization and a workspace so the
 * app never renders empty. Idempotent: returns the oldest usable membership.
 */
export async function ensureDefaultOrganization(
  user: Pick<User, "id" | "name" | "email">,
): Promise<{ organization: Organization; workspace: Workspace; created: boolean }> {
  const existing = await prisma.organizationMember.findFirst({
    where: { userId: user.id, organization: { workspaces: { some: {} } } },
    include: { organization: { include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } } } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    const { workspaces, ...organization } = existing.organization;
    return { organization, workspace: workspaces[0] as Workspace, created: false };
  }

  const { organization, workspace } = await createOrganization(user.id, {
    name: defaultOrganizationName(user),
    workspaceName: defaultWorkspaceName(user),
  });
  return { organization, workspace, created: true };
}

/** Every organization the user belongs to, with the plan that currently applies. */
export async function listOrganizationsForUser(userId: string): Promise<OrganizationListItem[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: { select: { id: true, name: true, slug: true, ...BILLING_FIELDS_SELECT, _count: { select: { workspaces: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    organization: { id: m.organization.id, name: m.organization.name, slug: m.organization.slug, plan: effectivePlan(m.organization) },
    role: m.role,
    workspaceCount: m.organization._count.workspaces,
    joinedAt: m.createdAt,
  }));
}

/**
 * Validates membership and returns the workspace to open: the oldest one in the
 * organization. The caller writes the cookies (route handlers only).
 */
export async function switchOrganization(userId: string, organizationId: string): Promise<{ organization: Organization; workspace: Workspace }> {
  const membership = await getOrganizationMembership(organizationId, userId);
  if (!membership) throw new ApiError(403, "You're not a member of that organization", "NOT_A_MEMBER");
  const workspace = await prisma.workspace.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  if (!workspace) throw new ApiError(409, "That organization has no workspaces yet", "NO_WORKSPACE");
  return { organization: membership.organization, workspace };
}

export async function renameOrganization(organizationId: string, actorId: string, name: string): Promise<Organization> {
  await assertOrganizationMembership(organizationId, actorId, "ADMIN");
  const clean = organizationNameSchema.parse(name);
  const organization = await prisma.organization.update({ where: { id: organizationId }, data: { name: clean } });
  await recordAudit({ userId: actorId, action: "organization.renamed", targetType: "organization", targetId: organizationId, metadata: { name: clean } });
  return organization;
}

/**
 * OWNER only. Refuses while a subscription would keep charging: cancel first.
 * Cascades every workspace and all of their data.
 */
export async function deleteOrganization(organizationId: string, actorId: string): Promise<void> {
  const { organization } = await assertOrganizationMembership(organizationId, actorId, "OWNER");
  const charging =
    organization.billingSubscriptionId !== null &&
    ["ACTIVE", "TRIALING", "PAST_DUE", "ON_HOLD"].includes(organization.billingStatus) &&
    !organization.cancelAtPeriodEnd;
  if (charging) {
    throw new ApiError(409, "Cancel the subscription under Billing first, then delete the organization.", "SUBSCRIPTION_ACTIVE");
  }
  await prisma.organization.delete({ where: { id: organizationId } });
  await recordAudit({
    userId: actorId,
    action: "organization.deleted",
    targetType: "organization",
    targetId: organizationId,
    metadata: { name: organization.name, slug: organization.slug },
  });
  logger.info("organization.deleted", { organizationId, actorId });
}

// ───────────────────────── Members ─────────────────────────

const userSummarySelect = { id: true, email: true, name: true, avatarUrl: true } as const;

export async function listMembers(organizationId: string): Promise<MemberWithUser[]> {
  // Enum order in the schema is OWNER, ADMIN, MEMBER: ascending puts owners first.
  return prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: userSummarySelect } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

async function countOwners(organizationId: string): Promise<number> {
  return prisma.organizationMember.count({ where: { organizationId, role: "OWNER" } });
}

/** OWNER only. Promoting to a second OWNER is allowed; demoting the last one is not. */
export async function updateMemberRole(organizationId: string, actorId: string, targetUserId: string, role: WorkspaceRole): Promise<MemberWithUser> {
  await assertOrganizationMembership(organizationId, actorId, "OWNER");
  const cleanRole = workspaceRoleSchema.parse(role);

  const target = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    include: { user: { select: userSummarySelect } },
  });
  if (!target) throw new ApiError(404, "Member not found", "NOT_FOUND");
  if (target.role === cleanRole) return target;

  if (target.role === "OWNER" && (await countOwners(organizationId)) <= 1) {
    throw new ApiError(409, "An organization needs at least one owner. Transfer ownership first.", "LAST_OWNER");
  }

  const updated = await prisma.organizationMember.update({
    where: { id: target.id },
    data: { role: cleanRole },
    include: { user: { select: userSummarySelect } },
  });
  await recordAudit({
    userId: actorId,
    action: "member.role_changed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { organizationId, from: target.role, to: cleanRole },
  });
  return updated;
}

/**
 * Removes a member. Anyone may remove themselves (leave); otherwise the actor
 * must be ADMIN+ and outrank the target, except OWNERs who may remove anyone.
 * The last OWNER can never be removed: transfer ownership first.
 */
export async function removeMember(organizationId: string, actorId: string, targetUserId: string): Promise<void> {
  const actor = await assertOrganizationMembership(organizationId, actorId, "MEMBER");
  const target = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
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
  if (target.role === "OWNER" && (await countOwners(organizationId)) <= 1) {
    throw new ApiError(409, "An organization needs at least one owner. Transfer ownership first.", "LAST_OWNER");
  }

  await prisma.organizationMember.delete({ where: { id: target.id } });
  await recordAudit({
    userId: actorId,
    action: isSelf ? "member.left" : "member.removed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { organizationId, role: target.role },
  });
}

/** OWNER only. The previous owner stays on as ADMIN so nobody is locked out mid-handover. */
export async function transferOwnership(organizationId: string, actorId: string, targetUserId: string): Promise<void> {
  const actor = await assertOrganizationMembership(organizationId, actorId, "OWNER");
  if (actorId === targetUserId) throw new ApiError(422, "You already own this organization", "ALREADY_OWNER");

  const target = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
  });
  if (!target) throw new ApiError(404, "Member not found", "NOT_FOUND");

  await prisma.$transaction([
    prisma.organizationMember.update({ where: { id: target.id }, data: { role: "OWNER" } }),
    prisma.organizationMember.update({ where: { id: actor.id }, data: { role: "ADMIN" } }),
  ]);
  await recordAudit({
    userId: actorId,
    action: "organization.ownership_transferred",
    targetType: "user",
    targetId: targetUserId,
    metadata: { organizationId, previousOwnerId: actorId },
  });
  logger.info("organization.ownership_transferred", { organizationId, from: actorId, to: targetUserId });
}

// ───────────────────────── Invitations ─────────────────────────

/**
 * Creates a 7-day invite link. Any earlier pending invite for the same
 * address is revoked first so exactly one live link exists per person.
 */
export async function inviteMember(organizationId: string, inviterId: string, email: string, role: WorkspaceRole): Promise<Invitation> {
  const inviter = await assertOrganizationMembership(organizationId, inviterId, "ADMIN");
  const cleanEmail = emailSchema.parse(email);
  const cleanRole = workspaceRoleSchema.parse(role);
  if (!canAssignRole(inviter.role, cleanRole)) {
    throw new ApiError(403, "Only the owner can invite another owner", "FORBIDDEN");
  }

  const alreadyMember = await prisma.organizationMember.findFirst({
    where: { organizationId, user: { email: cleanEmail } },
    select: { id: true },
  });
  if (alreadyMember) throw new ApiError(409, "That person is already a member of this organization", "ALREADY_MEMBER");

  await prisma.invitation.updateMany({
    where: { organizationId, email: cleanEmail, status: "PENDING" },
    data: { status: "REVOKED" },
  });

  const seats = await checkOrganizationLimit(organizationId, "members");
  if (!seats.ok) throw memberLimitError(seats.limit);

  const invitation = await prisma.invitation.create({
    data: {
      organizationId,
      email: cleanEmail,
      role: cleanRole,
      token: randomToken(32),
      invitedById: inviterId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
  });
  await recordAudit({
    userId: inviterId,
    action: "invitation.created",
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { organizationId, email: cleanEmail, role: cleanRole },
  });
  return invitation;
}

export async function getInvitationByToken(token: string) {
  if (!token || token.length > 128) return null;
  return prisma.invitation.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true, slug: true, plan: true, _count: { select: { workspaces: true } } } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

/** Pure state check shared by the invite page and `acceptInvitation`. */
export function invitationState(invitation: Pick<Invitation, "status" | "expiresAt" | "email">, userEmail: string, now = new Date()): InvitationState {
  if (invitation.status === "REVOKED") return "REVOKED";
  if (invitation.status === "ACCEPTED") return "ACCEPTED";
  if (invitation.expiresAt <= now) return "EXPIRED";
  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) return "EMAIL_MISMATCH";
  return "VALID";
}

/**
 * Turns a pending invitation into a membership and returns the workspace to
 * open. Idempotent for users who are already members. The seat limit is
 * re-checked here because the plan may have been downgraded since the invite.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
): Promise<{ organization: Organization; workspace: Workspace | null; role: WorkspaceRole }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(401, "Sign in to accept this invitation", "UNAUTHORIZED");

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: { include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } } } },
  });
  if (!invitation) throw new ApiError(404, "This invitation link is invalid", "INVITE_NOT_FOUND");
  const { workspaces, ...organization } = invitation.organization;
  const workspace = workspaces[0] ?? null;

  const existing = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
  });

  const state = invitationState(invitation, user.email);
  if (state === "ACCEPTED" && existing) return { organization, workspace, role: existing.role };
  if (state === "ACCEPTED") throw new ApiError(410, "This invitation has already been used", "INVITE_USED");
  if (state === "REVOKED") throw new ApiError(410, "This invitation was revoked", "INVITE_REVOKED");
  if (state === "EXPIRED") throw new ApiError(410, "This invitation has expired. Ask for a new link.", "INVITE_EXPIRED");
  if (state === "EMAIL_MISMATCH") {
    throw new ApiError(403, `This invitation was sent to ${invitation.email}`, "INVITE_EMAIL_MISMATCH");
  }

  if (existing) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
    return { organization, workspace, role: existing.role };
  }

  const limit = limitsFor(effectivePlan(organization)).members;
  const memberCount = await prisma.organizationMember.count({ where: { organizationId: invitation.organizationId } });
  if (memberCount >= limit) throw memberLimitError(limit);

  const [member] = await prisma.$transaction([
    prisma.organizationMember.create({ data: { organizationId: invitation.organizationId, userId, role: invitation.role } }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } }),
  ]);
  await recordAudit({
    userId,
    action: "invitation.accepted",
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { organizationId: invitation.organizationId, role: invitation.role, invitedById: invitation.invitedById },
  });
  logger.info("invitation.accepted", { organizationId: invitation.organizationId, userId, role: member.role });
  return { organization, workspace, role: member.role };
}

export async function revokeInvitation(organizationId: string, invitationId: string, actorId: string): Promise<void> {
  await assertOrganizationMembership(organizationId, actorId, "ADMIN");
  const result = await prisma.invitation.updateMany({
    where: { id: invitationId, organizationId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  if (result.count === 0) throw new ApiError(404, "Invitation not found or no longer pending", "NOT_FOUND");
  await recordAudit({ userId: actorId, action: "invitation.revoked", targetType: "invitation", targetId: invitationId, metadata: { organizationId } });
}

export async function listInvitations(
  organizationId: string,
  opts: { status?: InvitationStatus; includeLinks?: boolean } = {},
): Promise<InvitationSummary[]> {
  const rows = await prisma.invitation.findMany({
    where: { organizationId, status: opts.status ?? "PENDING" },
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
