import {
  ChannelPlatform,
  ChannelStatus,
  DeliveryKind,
  DeliveryStatus,
  JobStatus,
  JobType,
  PlanTier,
  type AutomationStatus,
  type BillingInterval,
  type BillingStatus,
  type MatchMode,
  type PlanSource,
  type Prisma,
  type TriggerType,
  type User,
  type WorkspaceRole,
} from "@prisma/client";
import { z } from "zod";

import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor, type PlanLimits } from "@/lib/billing/plans";
import { currentPeriodStart, getUsage, type QuotaResult } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import { isMetaConfigured, optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  cancelJob as queueCancelJob,
  getQueueStats,
  retryJob as queueRetryJob,
  STALE_LOCK_MS,
  type QueueStats,
} from "@/lib/queue";
import { syncSubscription } from "@/lib/services/billing";
import { recordAudit } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";

/**
 * Platform super-admin data access. Everything here is deliberately
 * cross-tenant: callers MUST gate with `requireSuperAdmin()` (pages) or
 * `assertSuperAdmin()` (route handlers) before touching these functions.
 *
 * Dates are returned as ISO strings so the same DTO types serve server
 * components, JSON route handlers and the client components that poll them.
 */

const DAY_MS = 24 * 3600 * 1000;
const SIGNUP_SERIES_DAYS = 30;
/** Mirrors TOKEN_REFRESH_WINDOW_DAYS in lib/meta/tokens.ts without pulling the Graph client into every admin render. */
const TOKEN_WARNING_DAYS = 10;
/** A worker that touched a job within this window is considered alive. */
const WORKER_HEARTBEAT_WINDOW_MS = 5 * 60_000;
/** Due jobs older than this with nobody claiming them mean the worker is down, not merely idle. */
const WORKER_BACKLOG_TOLERANCE_MS = 2 * 60_000;
/** Kinds that count as a DM for usage/traffic purposes (public comment replies are not DMs). */
const DM_KINDS: DeliveryKind[] = [DeliveryKind.PRIVATE_REPLY, DeliveryKind.MESSAGE, DeliveryKind.BROADCAST];

// ───────────────────────── Guards ─────────────────────────

/**
 * Route-handler guard. Non-admins get 404 (not 403) for the same reason as
 * `requireSuperAdmin`: the panel's existence shouldn't be discoverable.
 */
export function assertSuperAdmin(user: Pick<User, "isSuperAdmin">): void {
  if (!user.isSuperAdmin) throw new ApiError(404, "Not found", "NOT_FOUND");
}

// ───────────────────────── Validation ─────────────────────────

/** Query strings send `""` for cleared filters; treat that as "not set". */
const emptyToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

const cursorSchema = z.preprocess(emptyToUndefined, z.string().max(64).optional());
const limitSchema = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(25));

export const adminWorkspacesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  plan: z.preprocess(emptyToUndefined, z.nativeEnum(PlanTier).optional()),
  cursor: cursorSchema,
  limit: limitSchema,
});
export type AdminWorkspacesQuery = z.infer<typeof adminWorkspacesQuerySchema>;

export const setPlanSchema = z.object({ plan: z.nativeEnum(PlanTier) }).strict();

export const adminJobsQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.nativeEnum(JobStatus).optional()),
  type: z.preprocess(emptyToUndefined, z.nativeEnum(JobType).optional()),
  cursor: cursorSchema,
  limit: limitSchema,
});
export type AdminJobsQuery = z.infer<typeof adminJobsQuerySchema>;

export const adminWebhooksQuerySchema = z.object({
  processed: z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
  ),
  platform: z.preprocess(emptyToUndefined, z.nativeEnum(ChannelPlatform).optional()),
  cursor: cursorSchema,
  limit: limitSchema,
});
export type AdminWebhooksQuery = z.infer<typeof adminWebhooksQuerySchema>;

/**
 * Server pages receive `searchParams` as a loose record. Hand-edited URLs
 * shouldn't 500 an admin page, so invalid input falls back to the defaults.
 */
export function parseAdminSearchParams<S extends z.ZodTypeAny>(
  schema: S,
  searchParams: Record<string, string | string[] | undefined>,
): z.infer<S> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) flat[key] = first;
  }
  const parsed = schema.safeParse(flat);
  return parsed.success ? parsed.data : schema.parse({});
}

// ───────────────────────── Types ─────────────────────────

export type Page<T> = { items: T[]; nextCursor: string | null; total: number };

export type PlatformStats = {
  workspaces: number;
  users: number;
  channels: {
    total: number;
    byPlatform: Record<ChannelPlatform, number>;
    byStatus: Record<ChannelStatus, number>;
  };
  automationsActive: number;
  dmsToday: number;
  dms7d: number;
  jobs: { pending: number; processing: number; failed: number; completedToday: number };
  webhookEvents24h: { total: number; errors: number };
  /** One point per UTC day, oldest first. `date` is YYYY-MM-DD. */
  signupsSeries: Array<{ date: string; count: number }>;
  signups7d: number;
};

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  createdAt: string;
  onboardedAt: string | null;
  owner: { id: string; email: string; name: string | null } | null;
  counts: { members: number; channels: number; automations: number };
  dmsSentThisPeriod: number;
  dmLimit: number;
};

export type AdminWorkspaceMember = {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null; isSuperAdmin: boolean };
};

export type AdminWorkspaceChannel = {
  id: string;
  platform: ChannelPlatform;
  externalId: string;
  username: string | null;
  name: string | null;
  status: ChannelStatus;
  tokenExpiresAt: string | null;
  /** Whole days until the token expires; negative when already past, null when the token doesn't expire (FB pages). */
  tokenDaysLeft: number | null;
  webhookSubscribed: boolean;
  followerCount: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  automationCount: number;
  createdAt: string;
};

export type AdminWorkspaceAutomation = {
  id: string;
  name: string;
  status: AutomationStatus;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  channel: { platform: ChannelPlatform; username: string | null; name: string | null };
  triggeredCount: number;
  sentCount: number;
  lastTriggeredAt: string | null;
  updatedAt: string;
};

export type AdminWorkspaceUsage = {
  plan: PlanTier;
  limits: PlanLimits;
  periodStart: string;
  periodEnd: string;
  dms: QuotaResult;
  channels: QuotaResult;
  automations: QuotaResult;
  members: QuotaResult;
};

export type AdminDeliveryRow = {
  id: string;
  kind: DeliveryKind;
  status: DeliveryStatus;
  recipientUsername: string | null;
  messagePreview: string | null;
  errorMessage: string | null;
  automationName: string | null;
  createdAt: string;
};

export type AdminAuditRow = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { email: string; name: string | null } | null;
};

export type AdminWorkspaceBilling = {
  planSource: PlanSource;
  /** Plan whose limits apply right now (subscription/grace/override resolved). */
  effectivePlan: PlanTier;
  subscribedPlan: PlanTier | null;
  billingStatus: BillingStatus;
  billingInterval: BillingInterval | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  billingEmail: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type AdminWorkspaceDetail = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: PlanTier;
    timezone: string;
    dmsSentThisPeriod: number;
    usagePeriodStart: string;
    onboardedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  billing: AdminWorkspaceBilling;
  members: AdminWorkspaceMember[];
  pendingInvitations: number;
  channels: AdminWorkspaceChannel[];
  automations: AdminWorkspaceAutomation[];
  usage: AdminWorkspaceUsage;
  recentDeliveries: AdminDeliveryRow[];
  auditLog: AdminAuditRow[];
  totals: { contacts: number; conversations: number; deliveries: number; broadcasts: number; trackedLinks: number };
};

export type AdminJobRow = {
  id: string;
  type: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  dedupeKey: string | null;
  payload: unknown;
  workspace: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminJobsPage = Page<AdminJobRow> & { stats: QueueStats };

export type AdminWebhookEventRow = {
  id: string;
  platform: ChannelPlatform;
  field: string | null;
  dedupeKey: string;
  processed: boolean;
  error: string | null;
  payload: unknown;
  createdAt: string;
};

export type WorkerStatus = "healthy" | "idle" | "stale" | "unknown";

export type PlatformHealth = {
  status: "ok" | "degraded" | "down";
  checkedAt: string;
  db: { ok: boolean; latencyMs: number | null; error: string | null };
  worker: { status: WorkerStatus; lastSeenAt: string | null; dueJobs: number; oldestDueAt: string | null };
  queue: QueueStats;
  staleJobs: number;
  tokenExpiringSoon: number;
  channelsInError: number;
  webhooks: { last24h: number; errors24h: number; lastReceivedAt: string | null };
  config: { instagram: boolean; facebook: boolean; cronSecret: boolean; webhookVerifyToken: boolean };
};

// ───────────────────────── Helpers ─────────────────────────

function iso(date: Date): string;
function iso(date: Date | null | undefined): string | null;
function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** DMs used this period, applying the same lazy monthly reset as `getUsage` without writing. */
function effectiveDmsUsed(ws: { dmsSentThisPeriod: number; usagePeriodStart: Date }): number {
  return ws.usagePeriodStart < currentPeriodStart() ? 0 : ws.dmsSentThisPeriod;
}

const emptyQueueStats: QueueStats = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0, CANCELLED: 0, due: 0 };

// ───────────────────────── Overview ─────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const seriesStart = new Date(todayStart.getTime() - (SIGNUP_SERIES_DAYS - 1) * DAY_MS);
  const dmWhere = { status: DeliveryStatus.SENT, kind: { in: DM_KINDS } };

  const [
    workspaces,
    users,
    channelGroups,
    automationsActive,
    dmsToday,
    dms7d,
    queue,
    completedToday,
    webhooksTotal,
    webhookErrors,
    signups,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.user.count(),
    prisma.channel.groupBy({ by: ["platform", "status"], _count: { _all: true } }),
    prisma.automation.count({ where: { status: "ACTIVE" } }),
    prisma.deliveryLog.count({ where: { ...dmWhere, createdAt: { gte: todayStart } } }),
    prisma.deliveryLog.count({ where: { ...dmWhere, createdAt: { gte: sevenDaysAgo } } }),
    getQueueStats(),
    prisma.job.count({ where: { status: JobStatus.COMPLETED, updatedAt: { gte: todayStart } } }),
    prisma.webhookEvent.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.webhookEvent.count({ where: { createdAt: { gte: dayAgo }, error: { not: null } } }),
    // Bucketed in JS rather than date_trunc SQL: 30 days of signups is small, and this stays portable.
    prisma.user.findMany({ where: { createdAt: { gte: seriesStart } }, select: { createdAt: true } }),
  ]);

  const byPlatform: Record<ChannelPlatform, number> = { INSTAGRAM: 0, FACEBOOK: 0 };
  const byStatus: Record<ChannelStatus, number> = { ACTIVE: 0, TOKEN_EXPIRED: 0, DISCONNECTED: 0, ERROR: 0 };
  let channelTotal = 0;
  for (const row of channelGroups) {
    byPlatform[row.platform] += row._count._all;
    byStatus[row.status] += row._count._all;
    channelTotal += row._count._all;
  }

  const buckets = new Map<string, number>();
  for (let i = 0; i < SIGNUP_SERIES_DAYS; i++) buckets.set(dayKey(new Date(seriesStart.getTime() + i * DAY_MS)), 0);
  for (const user of signups) {
    const key = dayKey(user.createdAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return {
    workspaces,
    users,
    channels: { total: channelTotal, byPlatform, byStatus },
    automationsActive,
    dmsToday,
    dms7d,
    jobs: { pending: queue.PENDING, processing: queue.PROCESSING, failed: queue.FAILED, completedToday },
    webhookEvents24h: { total: webhooksTotal, errors: webhookErrors },
    signupsSeries: [...buckets].map(([date, count]) => ({ date, count })),
    signups7d: signups.filter((u) => u.createdAt >= sevenDaysAgo).length,
  };
}

// ───────────────────────── Workspaces ─────────────────────────

export async function listWorkspaces(input: AdminWorkspacesQuery): Promise<Page<AdminWorkspaceRow>> {
  const where: Prisma.WorkspaceWhereInput = {};
  if (input.plan) where.plan = input.plan;
  if (input.q) {
    where.OR = [
      { name: { contains: input.q, mode: "insensitive" } },
      { slug: { contains: input.q, mode: "insensitive" } },
      { members: { some: { role: "OWNER", user: { email: { contains: input.q, mode: "insensitive" } } } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.workspace.findMany({
      where,
      // id is the tiebreaker so cursor pagination is stable when createdAt collides.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        _count: { select: { members: true, channels: true, automations: true } },
        members: {
          where: { role: "OWNER" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    }),
    prisma.workspace.count({ where }),
  ]);

  const hasMore = rows.length > input.limit;
  const items = (hasMore ? rows.slice(0, input.limit) : rows).map<AdminWorkspaceRow>((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    plan: ws.plan,
    createdAt: iso(ws.createdAt),
    onboardedAt: iso(ws.onboardedAt),
    owner: ws.members[0]?.user ?? null,
    counts: ws._count,
    dmsSentThisPeriod: effectiveDmsUsed(ws),
    dmLimit: limitsFor(effectivePlan(ws)).dmsPerMonth,
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1].id : null, total };
}

export async function getWorkspaceDetail(workspaceId: string): Promise<AdminWorkspaceDetail | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      _count: { select: { contacts: true, conversations: true, deliveryLogs: true, broadcasts: true, trackedLinks: true } },
    },
  });
  if (!workspace) return null;

  const now = Date.now();
  const [members, pendingInvitations, channels, automations, usage, deliveries, audit] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true, isSuperAdmin: true } } },
    }),
    prisma.workspaceInvitation.count({ where: { workspaceId, status: "PENDING", expiresAt: { gt: new Date() } } }),
    // Explicit select so the encrypted token can never leak into a page or JSON response.
    prisma.channel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        platform: true,
        externalId: true,
        username: true,
        name: true,
        status: true,
        tokenExpiresAt: true,
        webhookSubscribed: true,
        followerCount: true,
        lastSyncedAt: true,
        lastError: true,
        createdAt: true,
        _count: { select: { automations: true } },
      },
    }),
    prisma.automation.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { channel: { select: { platform: true, username: true, name: true } } },
    }),
    getUsage(workspaceId),
    prisma.deliveryLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { automation: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      timezone: workspace.timezone,
      dmsSentThisPeriod: effectiveDmsUsed(workspace),
      usagePeriodStart: iso(workspace.usagePeriodStart),
      onboardedAt: iso(workspace.onboardedAt),
      createdAt: iso(workspace.createdAt),
      updatedAt: iso(workspace.updatedAt),
    },
    billing: {
      planSource: workspace.planSource,
      effectivePlan: effectivePlan(workspace),
      subscribedPlan: workspace.subscribedPlan,
      billingStatus: workspace.billingStatus,
      billingInterval: workspace.billingInterval,
      billingCustomerId: workspace.billingCustomerId,
      billingSubscriptionId: workspace.billingSubscriptionId,
      billingEmail: workspace.billingEmail,
      currentPeriodEnd: iso(workspace.currentPeriodEnd),
      cancelAtPeriodEnd: workspace.cancelAtPeriodEnd,
    },
    members: members.map((m) => ({ id: m.id, role: m.role, createdAt: iso(m.createdAt), user: m.user })),
    pendingInvitations,
    channels: channels.map((c) => ({
      id: c.id,
      platform: c.platform,
      externalId: c.externalId,
      username: c.username,
      name: c.name,
      status: c.status,
      tokenExpiresAt: iso(c.tokenExpiresAt),
      tokenDaysLeft: c.tokenExpiresAt ? Math.floor((c.tokenExpiresAt.getTime() - now) / DAY_MS) : null,
      webhookSubscribed: c.webhookSubscribed,
      followerCount: c.followerCount,
      lastSyncedAt: iso(c.lastSyncedAt),
      lastError: c.lastError,
      automationCount: c._count.automations,
      createdAt: iso(c.createdAt),
    })),
    automations: automations.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      triggerType: a.triggerType,
      matchMode: a.matchMode,
      keywords: a.keywords,
      channel: a.channel,
      triggeredCount: a.triggeredCount,
      sentCount: a.sentCount,
      lastTriggeredAt: iso(a.lastTriggeredAt),
      updatedAt: iso(a.updatedAt),
    })),
    usage: {
      plan: usage.plan,
      limits: usage.limits,
      periodStart: iso(usage.periodStart),
      periodEnd: iso(usage.periodEnd),
      dms: usage.dms,
      channels: usage.channels,
      automations: usage.automations,
      members: usage.members,
    },
    recentDeliveries: deliveries.map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      recipientUsername: d.recipientUsername,
      messagePreview: d.messagePreview,
      errorMessage: d.errorMessage,
      automationName: d.automation?.name ?? null,
      createdAt: iso(d.createdAt),
    })),
    auditLog: audit.map((a) => ({
      id: a.id,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      metadata: a.metadata,
      createdAt: iso(a.createdAt),
      actor: a.user,
    })),
    totals: {
      contacts: workspace._count.contacts,
      conversations: workspace._count.conversations,
      deliveries: workspace._count.deliveryLogs,
      broadcasts: workspace._count.broadcasts,
      trackedLinks: workspace._count.trackedLinks,
    },
  };
}

export type SetPlanResult = {
  workspace: { id: string; name: string; slug: string; plan: PlanTier; planSource: PlanSource };
  previousPlan: PlanTier;
  changed: boolean;
};

const PLAN_SELECT = { id: true, name: true, slug: true, plan: true, planSource: true } as const;

/**
 * Plan override by a super admin. Sets `planSource = ADMIN_OVERRIDE` so
 * subscription webhooks keep recording billing state but stop touching
 * `plan` until the override is cleared. Limits take effect immediately because
 * every quota check resolves the effective plan at call time; the DM counter
 * is intentionally left alone so a downgrade can't reset usage.
 */
export async function setWorkspacePlan(workspaceId: string, plan: PlanTier, actorUserId: string): Promise<SetPlanResult> {
  const existing = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: PLAN_SELECT });
  if (!existing) throw new ApiError(404, "Workspace not found", "NOT_FOUND");
  if (existing.plan === plan && existing.planSource === "ADMIN_OVERRIDE") {
    return { workspace: existing, previousPlan: existing.plan, changed: false };
  }

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { plan, planSource: "ADMIN_OVERRIDE" },
    select: PLAN_SELECT,
  });
  await recordAudit({
    workspaceId,
    userId: actorUserId,
    action: "admin.plan_changed",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { from: existing.plan, to: plan, previousSource: existing.planSource },
  });
  logger.info("admin.plan_changed", { workspaceId, actorUserId, from: existing.plan, to: plan });
  return { workspace, previousPlan: existing.plan, changed: true };
}

/**
 * Lifts an admin override. With a subscription on file the plan is re-derived
 * from Dodo (`syncSubscription` flips the source back to SUBSCRIPTION);
 * otherwise the workspace returns to the FREE default.
 */
export async function clearWorkspacePlanOverride(workspaceId: string, actorUserId: string): Promise<SetPlanResult> {
  const existing = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ...PLAN_SELECT, billingSubscriptionId: true },
  });
  if (!existing) throw new ApiError(404, "Workspace not found", "NOT_FOUND");
  if (existing.planSource !== "ADMIN_OVERRIDE") {
    return { workspace: existing, previousPlan: existing.plan, changed: false };
  }

  // Drop the override first so the sync is allowed to write `plan` again.
  await prisma.workspace.update({ where: { id: workspaceId }, data: { planSource: "DEFAULT", plan: "FREE" } });
  if (existing.billingSubscriptionId) {
    try {
      await syncSubscription(existing.billingSubscriptionId);
    } catch (err) {
      // Billing unreachable: the workspace is on FREE/DEFAULT until the next webhook or a manual reconcile.
      logger.warn("admin.override_cleared_sync_failed", { workspaceId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: PLAN_SELECT });
  await recordAudit({
    workspaceId,
    userId: actorUserId,
    action: "admin.plan_override_cleared",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { from: existing.plan, to: workspace.plan, source: workspace.planSource },
  });
  logger.info("admin.plan_override_cleared", { workspaceId, actorUserId, from: existing.plan, to: workspace.plan });
  return { workspace, previousPlan: existing.plan, changed: true };
}

// ───────────────────────── Jobs ─────────────────────────

const jobInclude = { workspace: { select: { id: true, name: true } } } satisfies Prisma.JobInclude;
type JobWithWorkspace = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

function toJobRow(job: JobWithWorkspace): AdminJobRow {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: iso(job.runAt),
    lockedAt: iso(job.lockedAt),
    lockedBy: job.lockedBy,
    lastError: job.lastError,
    dedupeKey: job.dedupeKey,
    payload: job.payload,
    workspace: job.workspace,
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
  };
}

export async function listJobs(input: AdminJobsQuery): Promise<AdminJobsPage> {
  const where: Prisma.JobWhereInput = {};
  if (input.status) where.status = input.status;
  if (input.type) where.type = input.type;

  const [rows, total, stats] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: jobInclude,
    }),
    prisma.job.count({ where }),
    getQueueStats(),
  ]);

  const hasMore = rows.length > input.limit;
  const items = (hasMore ? rows.slice(0, input.limit) : rows).map(toJobRow);
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null, total, stats };
}

async function findJobRow(id: string): Promise<AdminJobRow> {
  const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) throw new ApiError(404, "Job not found", "NOT_FOUND");
  return toJobRow(job);
}

/** Re-queues a FAILED/CANCELLED job with a fresh attempt budget (see lib/queue). */
export async function retryJob(id: string, actorUserId: string): Promise<AdminJobRow> {
  const job = await queueRetryJob(id);
  if (!job) {
    const current = await findJobRow(id);
    throw new ApiError(
      409,
      `Only failed or cancelled jobs can be retried (this job is ${current.status.toLowerCase()})`,
      "INVALID_STATE",
    );
  }
  await recordAudit({
    workspaceId: job.workspaceId,
    userId: actorUserId,
    action: "admin.job_retried",
    targetType: "job",
    targetId: id,
    metadata: { type: job.type },
  });
  logger.info("admin.job_retried", { jobId: id, type: job.type, actorUserId });
  return findJobRow(id);
}

/** Cancels a PENDING/FAILED job. PROCESSING jobs can't be stopped mid-flight; COMPLETED ones have nothing to cancel. */
export async function cancelJob(id: string, actorUserId: string): Promise<AdminJobRow> {
  const cancelled = await queueCancelJob(id);
  if (!cancelled) {
    const current = await findJobRow(id);
    throw new ApiError(
      409,
      `Only pending or failed jobs can be cancelled (this job is ${current.status.toLowerCase()})`,
      "INVALID_STATE",
    );
  }
  const row = await findJobRow(id);
  await recordAudit({
    workspaceId: row.workspace?.id ?? null,
    userId: actorUserId,
    action: "admin.job_cancelled",
    targetType: "job",
    targetId: id,
    metadata: { type: row.type },
  });
  logger.info("admin.job_cancelled", { jobId: id, type: row.type, actorUserId });
  return row;
}

// ───────────────────────── Webhooks ─────────────────────────

export async function listWebhookEvents(input: AdminWebhooksQuery): Promise<Page<AdminWebhookEventRow>> {
  const where: Prisma.WebhookEventWhereInput = {};
  if (input.processed !== undefined) where.processed = input.processed;
  if (input.platform) where.platform = input.platform;

  const [rows, total] = await Promise.all([
    prisma.webhookEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    }),
    prisma.webhookEvent.count({ where }),
  ]);

  const hasMore = rows.length > input.limit;
  const items = (hasMore ? rows.slice(0, input.limit) : rows).map<AdminWebhookEventRow>((e) => ({
    id: e.id,
    platform: e.platform,
    field: e.field,
    dedupeKey: e.dedupeKey,
    processed: e.processed,
    error: e.error,
    payload: e.payload,
    createdAt: iso(e.createdAt),
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null, total };
}

// ───────────────────────── Health ─────────────────────────

async function checkDatabase(): Promise<PlatformHealth["db"]> {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    logger.error("admin.health.db_unreachable", { error: err });
    return { ok: false, latencyMs: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function readConfig(): PlatformHealth["config"] {
  const meta = isMetaConfigured();
  return {
    instagram: meta.instagram,
    facebook: meta.facebook,
    cronSecret: Boolean(optionalEnv("CRON_SECRET")),
    webhookVerifyToken: Boolean(optionalEnv("META_WEBHOOK_VERIFY_TOKEN")),
  };
}

/**
 * The worker has no heartbeat table; its liveness is inferred from the jobs
 * it touches. "idle" (alive-or-not, nothing to do) is distinct from "stale"
 * (due work nobody is claiming) so a quiet night isn't reported as an outage.
 */
function classifyWorker(lastSeen: Date | null, oldestDue: Date | null, now: number): WorkerStatus {
  const backlogged = oldestDue !== null && now - oldestDue.getTime() > WORKER_BACKLOG_TOLERANCE_MS;
  if (backlogged) return "stale";
  if (!lastSeen) return "unknown";
  if (now - lastSeen.getTime() <= WORKER_HEARTBEAT_WINDOW_MS) return "healthy";
  return "idle";
}

export async function getHealth(): Promise<PlatformHealth> {
  const nowDate = new Date();
  const now = nowDate.getTime();
  const config = readConfig();
  const db = await checkDatabase();

  if (!db.ok) {
    return {
      status: "down",
      checkedAt: nowDate.toISOString(),
      db,
      worker: { status: "unknown", lastSeenAt: null, dueJobs: 0, oldestDueAt: null },
      queue: emptyQueueStats,
      staleJobs: 0,
      tokenExpiringSoon: 0,
      channelsInError: 0,
      webhooks: { last24h: 0, errors24h: 0, lastReceivedAt: null },
      config,
    };
  }

  const dayAgo = new Date(now - DAY_MS);
  const [queue, activity, oldestDue, staleJobs, tokenExpiringSoon, channelsInError, webhooks24h, webhookErrors24h, lastWebhook] =
    await Promise.all([
      getQueueStats(),
      prisma.job.aggregate({
        where: { status: { in: [JobStatus.PROCESSING, JobStatus.COMPLETED] } },
        _max: { updatedAt: true, lockedAt: true },
      }),
      prisma.job.findFirst({
        where: { status: JobStatus.PENDING, runAt: { lte: nowDate } },
        orderBy: { runAt: "asc" },
        select: { runAt: true },
      }),
      prisma.job.count({ where: { status: JobStatus.PROCESSING, lockedAt: { lt: new Date(now - STALE_LOCK_MS) } } }),
      prisma.channel.count({
        where: {
          platform: ChannelPlatform.INSTAGRAM,
          status: { in: [ChannelStatus.ACTIVE, ChannelStatus.ERROR] },
          OR: [{ tokenExpiresAt: null }, { tokenExpiresAt: { lte: new Date(now + TOKEN_WARNING_DAYS * DAY_MS) } }],
        },
      }),
      prisma.channel.count({ where: { status: { in: [ChannelStatus.ERROR, ChannelStatus.TOKEN_EXPIRED] } } }),
      prisma.webhookEvent.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.webhookEvent.count({ where: { createdAt: { gte: dayAgo }, error: { not: null } } }),
      prisma.webhookEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);

  const candidates = [activity._max.updatedAt, activity._max.lockedAt].filter((d): d is Date => d !== null);
  const lastSeen = candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
  const workerStatus = classifyWorker(lastSeen, oldestDue?.runAt ?? null, now);

  // Tenant-level problems (expired tokens, failed jobs) are surfaced as warnings but don't mark the platform degraded.
  const degraded = workerStatus === "stale" || staleJobs > 0 || (!config.instagram && !config.facebook);

  return {
    status: degraded ? "degraded" : "ok",
    checkedAt: nowDate.toISOString(),
    db,
    worker: { status: workerStatus, lastSeenAt: iso(lastSeen), dueJobs: queue.due, oldestDueAt: iso(oldestDue?.runAt) },
    queue,
    staleJobs,
    tokenExpiringSoon,
    channelsInError,
    webhooks: { last24h: webhooks24h, errors24h: webhookErrors24h, lastReceivedAt: iso(lastWebhook?.createdAt) },
    config,
  };
}
