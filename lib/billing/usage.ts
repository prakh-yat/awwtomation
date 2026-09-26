import type { PlanTier } from "@prisma/client";

import { prisma } from "@/lib/db";
import { BILLING_FIELDS_SELECT, effectivePlan, historyPlan } from "@/lib/billing/entitlements";
import { isLivePlan, limitsFor, type PlanLimits } from "@/lib/billing/plans";
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
  workspaces: QuotaResult;
  automations: QuotaResult;
  contacts: QuotaResult;
  /** Broadcasts started this calendar month. */
  broadcasts: QuotaResult;
  members: QuotaResult;
  /** Days of conversations and delivery logs kept (the paid window survives a lapse briefly, see `historyPlan`). */
  historyDays: number;
};

/** Billing periods are calendar months in UTC (DB dates are UTC). */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * The oldest instant an organization's history keeps: its plan's window,
 * pulled back to the start of the billing month when the window would cut
 * into it, so this month's usage always adds up. Older delivery logs and
 * messages are deleted by lib/services/retention.ts.
 */
export function historyCutoff(historyDays: number, now = new Date()): Date {
  const windowStart = new Date(now.getTime() - historyDays * 24 * 3600 * 1000);
  const periodStart = currentPeriodStart(now);
  return windowStart < periodStart ? windowStart : periodStart;
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
 * Gives back quota reserved for a DM that never went out.
 *
 * `reserveDmQuota` runs before the Meta call, because a quota check after the
 * fact cannot stop anything. When the call then fails, or is deferred and will
 * be attempted again, the reservation has to come back: otherwise a channel
 * with an expired token, or one Meta is throttling, spends a month's allowance
 * on messages nobody received.
 *
 * Clamped at zero and conditional on the period so a release arriving after the
 * monthly reset cannot push the new period's counter negative.
 */
export async function releaseDmQuota(workspaceId: string, n = 1): Promise<void> {
  if (!Number.isInteger(n) || n < 1) return;
  const periodStart = currentPeriodStart();
  try {
    const organizationId = await organizationIdFor(workspaceId);
    await prisma.organization.updateMany({
      where: { id: organizationId, usagePeriodStart: { gte: periodStart }, dmsSentThisPeriod: { gte: n } },
      data: { dmsSentThisPeriod: { decrement: n } },
    });
  } catch (err) {
    // Never let bookkeeping break a send path that is already failing.
    logger.warn("billing.dm_quota_release_failed", { workspaceId, n, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Read-only snapshot for dashboards and the billing page. If the stored
 * period is stale we report zero DMs used rather than writing: the next
 * `reserveDmQuota` call performs the real reset.
 */
export async function getOrganizationUsage(organizationId: string): Promise<OrganizationUsage> {
  const periodStart = currentPeriodStart();
  const [org, channels, workspaces, automations, contacts, broadcasts, members] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { ...BILLING_FIELDS_SELECT, dmsSentThisPeriod: true, usagePeriodStart: true },
    }),
    countChannels(organizationId),
    countWorkspaces(organizationId),
    countAutomations(organizationId),
    countContacts(organizationId),
    countBroadcastsStarted(organizationId, periodStart),
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
    workspaces: { ok: workspaces < limits.workspaces, used: workspaces, limit: limits.workspaces },
    automations: { ok: automations < limits.automations, used: automations, limit: limits.automations },
    contacts: { ok: contacts < limits.contacts, used: contacts, limit: limits.contacts },
    broadcasts: { ok: broadcasts < limits.broadcastsPerMonth, used: broadcasts, limit: limits.broadcastsPerMonth },
    members: { ok: members < limits.members, used: members, limit: limits.members },
    historyDays: limitsFor(historyPlan(org)).historyDays,
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

function countWorkspaces(organizationId: string): Promise<number> {
  return prisma.workspace.count({ where: { organizationId } });
}

function countContacts(organizationId: string): Promise<number> {
  return prisma.contact.count({ where: { workspace: { organizationId } } });
}

/** A broadcast counts in the month it started sending, whatever happened to it after. */
function countBroadcastsStarted(organizationId: string, since: Date): Promise<number> {
  return prisma.broadcast.count({ where: { workspace: { organizationId }, startedAt: { gte: since } } });
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

export type LimitKind = "channels" | "workspaces" | "automations" | "contacts" | "members";

function countFor(organizationId: string, kind: LimitKind): Promise<number> {
  switch (kind) {
    case "channels":
      return countChannels(organizationId);
    case "workspaces":
      return countWorkspaces(organizationId);
    case "automations":
      return countAutomations(organizationId);
    case "contacts":
      return countContacts(organizationId);
    case "members":
      return countSeats(organizationId);
  }
}

/** How much of one plan limit the organization has used. */
export async function checkOrganizationLimit(organizationId: string, kind: LimitKind): Promise<QuotaResult> {
  const [plan, used] = await Promise.all([effectivePlanForOrganization(organizationId), countFor(organizationId, kind)]);
  const limit = limitsFor(plan)[kind];
  return { ok: used < limit, used, limit };
}

/** Detailed variant of the `canAdd*` helpers for building error messages. Counts the whole organization. */
export async function checkLimit(workspaceId: string, kind: LimitKind): Promise<QuotaResult> {
  return checkOrganizationLimit(await organizationIdFor(workspaceId), kind);
}

export type WorkspaceLimitKind = "aiAgentsPerWorkspace" | "pipelinesPerWorkspace";

/** Limits that apply to each workspace on its own rather than to the whole organization. */
export async function checkWorkspaceLimit(workspaceId: string, kind: WorkspaceLimitKind): Promise<QuotaResult> {
  const [plan, used] = await Promise.all([
    effectivePlanFor(workspaceId),
    kind === "aiAgentsPerWorkspace" ? prisma.aiAgent.count({ where: { workspaceId } }) : prisma.pipeline.count({ where: { workspaceId } }),
  ]);
  const limit = limitsFor(plan)[kind];
  return { ok: used < limit, used, limit };
}

/**
 * Broadcasts left this month. `scheduledFor` also counts broadcasts already
 * scheduled for the current month (other than `excludeId`), so scheduling one
 * says no up front instead of failing when it comes due.
 */
export async function checkBroadcastQuota(workspaceId: string, opts: { scheduledFor?: Date; excludeId?: string } = {}): Promise<QuotaResult> {
  const organizationId = await organizationIdFor(workspaceId);
  const periodStart = currentPeriodStart();
  const periodEnd = nextPeriodStart();
  const inThisPeriod = opts.scheduledFor ? opts.scheduledFor >= periodStart && opts.scheduledFor < periodEnd : false;
  const [plan, started, scheduled] = await Promise.all([
    effectivePlanForOrganization(organizationId),
    countBroadcastsStarted(organizationId, periodStart),
    inThisPeriod
      ? prisma.broadcast.count({
          where: {
            workspace: { organizationId },
            status: "SCHEDULED",
            scheduledAt: { gte: periodStart, lt: periodEnd },
            ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
          },
        })
      : Promise.resolve(0),
  ]);
  const limit = limitsFor(plan).broadcastsPerMonth;
  const used = started + scheduled;
  return { ok: used < limit, used, limit };
}

/**
 * How many more contacts the organization's plan allows (0 when it is at or
 * over the limit). Imports, manual adds and new people who comment or message
 * are all held to this: nothing creates a contact past it.
 */
export async function contactRoom(workspaceId: string): Promise<QuotaResult & { room: number }> {
  const result = await checkLimit(workspaceId, "contacts");
  return { ...result, room: Math.max(0, result.limit - result.used) };
}

/**
 * Whether a contact falls inside the plan's contact limit. The oldest
 * contacts are the ones inside it, so the people a business already talks to
 * keep getting replies and only the newest arrivals past the limit wait for
 * an upgrade. Costs one count, and a second only when the organization is
 * over the limit.
 */
export async function contactWithinPlan(contact: { id: string; workspaceId: string; createdAt: Date }): Promise<boolean> {
  return (await automationAllowedFor(contact)) !== "contact_limit";
}

/**
 * Whether an automation may start for this contact: "no_plan" when the
 * organization has no paid plan (nothing is sent until it subscribes),
 * "contact_limit" when the contact arrived after the plan's contact limit.
 */
export async function automationAllowedFor(contact: { id: string; workspaceId: string; createdAt: Date }): Promise<"ok" | "no_plan" | "contact_limit"> {
  const organizationId = await organizationIdFor(contact.workspaceId);
  const plan = await effectivePlanForOrganization(organizationId);
  if (!isLivePlan(plan)) return "no_plan";
  const total = await countContacts(organizationId);
  const limit = limitsFor(plan).contacts;
  if (total <= limit) return "ok";
  const older = await prisma.contact.count({
    where: {
      workspace: { organizationId },
      OR: [{ createdAt: { lt: contact.createdAt } }, { createdAt: contact.createdAt, id: { lt: contact.id } }],
    },
  });
  return older < limit ? "ok" : "contact_limit";
}

/** Days of history the organization that owns `workspaceId` keeps. */
export async function historyDaysFor(workspaceId: string): Promise<number> {
  const org = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { organization: { select: BILLING_FIELDS_SELECT } } });
  return limitsFor(historyPlan(org.organization)).historyDays;
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
  return limitsFor(await effectivePlanFor(workspaceId)).broadcastsPerMonth > 0;
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
