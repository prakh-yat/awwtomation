import type { PlanTier } from "@prisma/client";

import { prisma } from "@/lib/db";
import { BILLING_FIELDS_SELECT, effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor, type PlanLimits } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";

export type QuotaResult = { ok: boolean; used: number; limit: number };

export type WorkspaceUsage = {
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

/**
 * Atomically reserves `n` DMs against the workspace's monthly quota.
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

  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { ...BILLING_FIELDS_SELECT, dmsSentThisPeriod: true, usagePeriodStart: true },
    });
    if (!ws) throw new Error(`reserveDmQuota: workspace ${workspaceId} not found`);
    // Limits follow the *effective* plan so a lapsed subscription or an admin override applies immediately.
    const limit = limitsFor(effectivePlan(ws)).dmsPerMonth;

    if (ws.usagePeriodStart < periodStart) {
      await tx.workspace.updateMany({
        where: { id: workspaceId, usagePeriodStart: { lt: periodStart } },
        data: { dmsSentThisPeriod: 0, usagePeriodStart: periodStart },
      });
    }

    const reserved = await tx.workspace.updateMany({
      where: { id: workspaceId, dmsSentThisPeriod: { lte: limit - n } },
      data: { dmsSentThisPeriod: { increment: n } },
    });

    const after = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { dmsSentThisPeriod: true },
    });

    if (reserved.count !== 1) {
      logger.warn("billing.dm_quota_exceeded", { workspaceId, used: after.dmsSentThisPeriod, limit, requested: n });
      return { ok: false, used: after.dmsSentThisPeriod, limit };
    }
    return { ok: true, used: after.dmsSentThisPeriod, limit };
  });
}

/**
 * Read-only snapshot for dashboards and the billing page. If the stored
 * period is stale we report zero DMs used rather than writing — the next
 * `reserveDmQuota` call performs the real reset.
 */
export async function getUsage(workspaceId: string): Promise<WorkspaceUsage> {
  const periodStart = currentPeriodStart();
  const [ws, channels, automations, members] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { ...BILLING_FIELDS_SELECT, dmsSentThisPeriod: true, usagePeriodStart: true },
    }),
    countChannels(workspaceId),
    countAutomations(workspaceId),
    countSeats(workspaceId),
  ]);
  const plan = effectivePlan(ws);
  const limits = limitsFor(plan);
  const dmsUsed = ws.usagePeriodStart < periodStart ? 0 : ws.dmsSentThisPeriod;

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

/** Disconnected channels free up their slot; every other status still counts. */
function countChannels(workspaceId: string): Promise<number> {
  return prisma.channel.count({ where: { workspaceId, status: { not: "DISCONNECTED" } } });
}

function countAutomations(workspaceId: string): Promise<number> {
  return prisma.automation.count({ where: { workspaceId } });
}

/**
 * Seats = members + pending invitations that haven't expired, so an admin
 * can't hand out more invite links than the plan will let people accept.
 */
async function countSeats(workspaceId: string): Promise<number> {
  const [members, pendingInvites] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.workspaceInvitation.count({ where: { workspaceId, status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  return members + pendingInvites;
}

export type LimitKind = "channels" | "automations" | "members";

/** Detailed variant of the `canAdd*` helpers for building error messages. */
export async function checkLimit(workspaceId: string, kind: LimitKind): Promise<QuotaResult> {
  const limits = limitsFor(await effectivePlanFor(workspaceId));
  const used =
    kind === "channels"
      ? await countChannels(workspaceId)
      : kind === "automations"
        ? await countAutomations(workspaceId)
        : await countSeats(workspaceId);
  const limit = limits[kind];
  return { ok: used < limit, used, limit };
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

/** The plan whose limits currently apply (see lib/billing/entitlements.ts). */
export async function effectivePlanFor(workspaceId: string): Promise<PlanTier> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: BILLING_FIELDS_SELECT });
  return effectivePlan(ws);
}
