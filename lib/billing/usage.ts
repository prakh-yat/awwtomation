import type { PlanTier } from "@prisma/client";

import { prisma } from "@/lib/db";
import { BILLING_FIELDS_SELECT, effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor, type PlanLimits } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";

export type QuotaResult = { ok: boolean; used: number; limit: number };

/**
 * Plans belong to organizations, so every quota below is counted across all of
 * an organization's workspaces. Functions that take a `workspaceId` resolve
 * its organization first; that is what the send path and most pages have.
 */
export type OrganizationUsage = {
  /** The effective plan (subscription, grace period and admin overrides already applied). */
  plan: PlanTier;
  limits: PlanLimits;
  periodStart: Date;
  periodEnd: Date;
  dms: QuotaResult;
  channels: QuotaResult;
  automations: QuotaResult;
  members: QuotaResult;
};

/** Billing periods are calendar months in UTC (DB dates are UTC). */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** The organization a workspace belongs to. Throws when the workspace doesn't exist. */
export async function organizationIdFor(workspaceId: string): Promise<string> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { organizationId: true } });
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);
  return ws.organizationId;
}

/**
 * Atomically reserves `n` DMs against the monthly quota of the organization
 * that owns `workspaceId`.
 *
 * Correctness under concurrency comes from the conditional `updateMany`: the
 * row is only incremented when `dmsSentThisPeriod + n <= limit` holds at the
 * moment Postgres evaluates it, so parallel workers can never overshoot. The
 * monthly reset is likewise conditional on `usagePeriodStart` so two workers
 * racing on the first of the month reset exactly once.
 */
export async function reserveDmQuota(workspaceId: string, n = 1): Promise<QuotaResult> {
  if (!Number.isInteger(n) || n < 1) throw new Error(`reserveDmQuota: n must be a positive integer, got ${n}`);
  const periodStart = currentPeriodStart();
  const organizationId = await organizationIdFor(workspaceId);

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { ...BILLING_FIELDS_SELECT, dmsSentThisPeriod: true, usagePeriodStart: true },
    });
    if (!org) throw new Error(`reserveDmQuota: organization ${organizationId} not found`);
    // Limits follow the *effective* plan so a lapsed subscription or an admin override applies immediately.
    const limit = limitsFor(effectivePlan(org)).dmsPerMonth;

    if (org.usagePeriodStart < periodStart) {
      await tx.organization.updateMany({
        where: { id: organizationId, usagePeriodStart: { lt: periodStart } },
        data: { dmsSentThisPeriod: 0, usagePeriodStart: periodStart },
      });
    }

    const reserved = await tx.organization.updateMany({
      where: { id: organizationId, dmsSentThisPeriod: { lte: limit - n } },
      data: { dmsSentThisPeriod: { increment: n } },
    });

    const after = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { dmsSentThisPeriod: true },
    });

    if (reserved.count !== 1) {
      logger.warn("billing.dm_quota_exceeded", { organizationId, workspaceId, used: after.dmsSentThisPeriod, limit, requested: n });
      return { ok: false, used: after.dmsSentThisPeriod, limit };
    }
    return { ok: true, used: after.dmsSentThisPeriod, limit };
  });
}

/**
 * Read-only snapshot for dashboards and the billing page. If the stored
 * period is stale we report zero DMs used rather than writing: the next
 * `reserveDmQuota` call performs the real reset.
 */
export async function getOrganizationUsage(organizationId: string): Promise<OrganizationUsage> {
  const periodStart = currentPeriodStart();
  const [org, channels, automations, members] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { ...BILLING_FIELDS_SELECT, dmsSentThisPeriod: true, usagePeriodStart: true },
    }),
    countChannels(organizationId),
    countAutomations(organizationId),
    countSeats(organizationId),
  ]);
  const plan = effectivePlan(org);
  const limits = limitsFor(plan);
  const dmsUsed = org.usagePeriodStart < periodStart ? 0 : org.dmsSentThisPeriod;

  return {
    plan,
    limits,
    periodStart,
    periodEnd: nextPeriodStart(),
    dms: { ok: dmsUsed < limits.dmsPerMonth, used: dmsUsed, limit: limits.dmsPerMonth },
    channels: { ok: channels < limits.channels, used: channels, limit: limits.channels },
    automations: { ok: automations < limits.automations, used: automations, limit: limits.automations },
    members: { ok: members < limits.members, used: members, limit: limits.members },
  };
}

/** Usage of the organization that owns `workspaceId`. */
export async function getUsage(workspaceId: string): Promise<OrganizationUsage> {
  return getOrganizationUsage(await organizationIdFor(workspaceId));
}

/** Disconnected channels free up their slot; every other status still counts. */
function countChannels(organizationId: string): Promise<number> {
  return prisma.channel.count({ where: { workspace: { organizationId }, status: { not: "DISCONNECTED" } } });
}

function countAutomations(organizationId: string): Promise<number> {
  return prisma.automation.count({ where: { workspace: { organizationId } } });
}

/**
 * Seats = members + pending invitations that haven't expired, so an admin
 * can't hand out more invite links than the plan will let people accept.
 */
async function countSeats(organizationId: string): Promise<number> {
  const [members, pendingInvites] = await Promise.all([
    prisma.organizationMember.count({ where: { organizationId } }),
    prisma.invitation.count({ where: { organizationId, status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  return members + pendingInvites;
}

export type LimitKind = "channels" | "automations" | "members";

/** How much of one plan limit the organization has used. */
export async function checkOrganizationLimit(organizationId: string, kind: LimitKind): Promise<QuotaResult> {
  const limits = limitsFor(await effectivePlanForOrganization(organizationId));
  const used =
    kind === "channels"
      ? await countChannels(organizationId)
      : kind === "automations"
        ? await countAutomations(organizationId)
        : await countSeats(organizationId);
  const limit = limits[kind];
  return { ok: used < limit, used, limit };
}

/** Detailed variant of the `canAdd*` helpers for building error messages. Counts the whole organization. */
export async function checkLimit(workspaceId: string, kind: LimitKind): Promise<QuotaResult> {
  return checkOrganizationLimit(await organizationIdFor(workspaceId), kind);
}

export async function canAddChannel(workspaceId: string): Promise<boolean> {
  return (await checkLimit(workspaceId, "channels")).ok;
}

export async function canAddAutomation(workspaceId: string): Promise<boolean> {
  return (await checkLimit(workspaceId, "automations")).ok;
}

export async function canAddMember(workspaceId: string): Promise<boolean> {
  return (await checkLimit(workspaceId, "members")).ok;
}

export async function canUseBroadcasts(workspaceId: string): Promise<boolean> {
  return limitsFor(await effectivePlanFor(workspaceId)).broadcasts;
}

/** The plan whose limits currently apply to an organization (see lib/billing/entitlements.ts). */
export async function effectivePlanForOrganization(organizationId: string): Promise<PlanTier> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: BILLING_FIELDS_SELECT });
  return effectivePlan(org);
}

/** The plan whose limits apply to the organization that owns `workspaceId`. */
export async function effectivePlanFor(workspaceId: string): Promise<PlanTier> {
  return effectivePlanForOrganization(await organizationIdFor(workspaceId));
}
