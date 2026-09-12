/**
 * DM usage over time for Settings → Usage and the dashboard projection.
 *
 * The live counter (`Workspace.dmsSentThisPeriod`, reserved atomically by
 * lib/billing/usage.ts) is the number the plan limit is enforced against, so
 * the current period always reports it. Past months are rebuilt from
 * DeliveryLog rows with status SENT — the same events that reserve quota —
 * which can differ from the historical counter by a handful of sends that
 * reserved quota and then failed at Meta. Periods are UTC calendar months,
 * matching `currentPeriodStart()`.
 */
import { type PlanTier, Prisma } from "@prisma/client";

import { currentPeriodStart, getUsage } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";

export const USAGE_HISTORY_DEFAULT_MONTHS = 6;
export const USAGE_HISTORY_MAX_MONTHS = 24;
/** Share of the limit at which the UI starts nudging towards an upgrade. */
export const USAGE_WARNING_THRESHOLD = 0.8;
const TOP_AUTOMATIONS = 5;
const DAY_MS = 24 * 3600 * 1000;

export type UsageMonth = {
  /** YYYY-MM (UTC). */
  month: string;
  /** "Sep 2026" — pre-rendered so the client chart needs no date parsing. */
  label: string;
  /** SENT private replies + messages + broadcasts (what the plan meters). */
  dmsSent: number;
  privateReplies: number;
  broadcasts: number;
  publicReplies: number;
  /** The current plan's monthly limit; historical plan changes are not tracked. */
  limit: number;
  /** dmsSent / limit — above 1 means the month went over the current limit. */
  overagePct: number;
  isCurrent: boolean;
};

export type UsageProjection = {
  used: number;
  limit: number;
  /** used / limit, uncapped. */
  pct: number;
  daysElapsed: number;
  daysInPeriod: number;
  /** Linear end-of-period estimate from the pace so far. */
  projected: number;
  projectedPct: number;
  overLimit: boolean;
  /** When the limit will be hit at the current pace (ISO), null if it won't be this period. */
  exhaustsAt: string | null;
  periodStart: string;
  resetsAt: string;
};

export type UsageWarning = { level: "warning" | "critical"; message: string };

export type UsageChannelRow = {
  channel: { id: string; platform: "INSTAGRAM" | "FACEBOOK"; username: string | null; name: string | null };
  used: number;
};

export type UsageAutomationRow = { id: string; name: string; used: number };

export type UsageCurrentPeriod = UsageProjection & {
  plan: PlanTier;
  planLabel: string;
  perChannel: UsageChannelRow[];
  perAutomation: UsageAutomationRow[];
  /** DMs this period that came from broadcasts (not attributed to an automation). */
  broadcasts: number;
};

export type UsageHistory = {
  currentPeriod: UsageCurrentPeriod;
  /** Oldest first, ending with the current month. */
  months: UsageMonth[];
  warnings: UsageWarning[];
};

// ───────────────────────── Projection (pure) ─────────────────────────

/**
 * Linear projection: pace so far × days in the period. The first day always
 * counts as one elapsed day so a brand-new period never divides by zero.
 */
export function projectUsage(input: { used: number; limit: number; periodStart: Date; periodEnd: Date; now?: Date }): UsageProjection {
  const now = input.now ?? new Date();
  const daysInPeriod = Math.max(1, Math.round((input.periodEnd.getTime() - input.periodStart.getTime()) / DAY_MS));
  const elapsedMs = Math.min(Math.max(now.getTime() - input.periodStart.getTime(), 0), daysInPeriod * DAY_MS);
  const daysElapsed = Math.min(daysInPeriod, Math.max(1, Math.ceil(elapsedMs / DAY_MS)));
  const perDay = input.used / daysElapsed;
  const projected = Math.round(perDay * daysInPeriod);
  const limit = input.limit;

  let exhaustsAt: string | null = null;
  if (limit > 0 && input.used >= limit) exhaustsAt = now.toISOString();
  else if (limit > 0 && perDay > 0 && projected >= limit) {
    exhaustsAt = new Date(input.periodStart.getTime() + (limit / perDay) * DAY_MS).toISOString();
  }

  return {
    used: input.used,
    limit,
    pct: limit > 0 ? input.used / limit : 1,
    daysElapsed,
    daysInPeriod,
    projected,
    projectedPct: limit > 0 ? projected / limit : 1,
    overLimit: limit > 0 ? projected > limit : true,
    exhaustsAt,
    periodStart: input.periodStart.toISOString(),
    resetsAt: input.periodEnd.toISOString(),
  };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function usageWarnings(projection: UsageProjection): UsageWarning[] {
  const warnings: UsageWarning[] = [];
  const limit = projection.limit.toLocaleString("en-US");
  if (projection.pct >= 1) {
    warnings.push({
      level: "critical",
      message: `You've used all ${limit} DMs for this period. Automations skip sends until usage resets on ${shortDate(projection.resetsAt)}.`,
    });
    return warnings;
  }
  if (projection.pct >= USAGE_WARNING_THRESHOLD) {
    warnings.push({
      level: "warning",
      message: `You've used ${Math.round(projection.pct * 100)}% of your ${limit} DMs this period.`,
    });
  }
  if (projection.overLimit && projection.exhaustsAt) {
    warnings.push({
      level: "warning",
      message: `At the current pace you'll reach the limit around ${shortDate(projection.exhaustsAt)}, before it resets on ${shortDate(projection.resetsAt)}.`,
    });
  }
  return warnings;
}

// ───────────────────────── Queries ─────────────────────────

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Prisma stores timestamps as UTC wall-clock, so an ISO string cast to `timestamp` compares without any session-zone conversion. */
function utcBound(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString()}::timestamp`;
}

const SENT = Prisma.sql`'SENT'::"DeliveryStatus"`;
const DM_KINDS = Prisma.sql`'PRIVATE_REPLY'::"DeliveryKind", 'MESSAGE'::"DeliveryKind", 'BROADCAST'::"DeliveryKind"`;

type MonthRow = { month: string; dms_sent: number; private_replies: number; broadcasts: number; public_replies: number };
type ChannelRow = { channelId: string; count: number };
type AutomationRow = { automationId: string | null; count: number };

export async function getUsageHistory(workspaceId: string, months = USAGE_HISTORY_DEFAULT_MONTHS): Promise<UsageHistory> {
  const span = Math.min(Math.max(Math.trunc(months), 1), USAGE_HISTORY_MAX_MONTHS);
  const now = new Date();
  const periodStart = currentPeriodStart(now);
  const firstMonth = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - (span - 1), 1));

  const [usage, monthRows, channelRows, automationRows] = await Promise.all([
    getUsage(workspaceId),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
        (COUNT(*) FILTER (WHERE "status" = ${SENT} AND "kind" IN (${DM_KINDS})))::int AS dms_sent,
        (COUNT(*) FILTER (WHERE "status" = ${SENT} AND "kind" = 'PRIVATE_REPLY'::"DeliveryKind"))::int AS private_replies,
        (COUNT(*) FILTER (WHERE "status" = ${SENT} AND "kind" = 'BROADCAST'::"DeliveryKind"))::int AS broadcasts,
        (COUNT(*) FILTER (WHERE "status" = ${SENT} AND "kind" = 'PUBLIC_REPLY'::"DeliveryKind"))::int AS public_replies
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${utcBound(firstMonth)}
      GROUP BY 1
    `),
    prisma.$queryRaw<ChannelRow[]>(Prisma.sql`
      SELECT "channelId", COUNT(*)::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "status" = ${SENT} AND "kind" IN (${DM_KINDS}) AND "createdAt" >= ${utcBound(periodStart)}
      GROUP BY 1
    `),
    prisma.$queryRaw<AutomationRow[]>(Prisma.sql`
      SELECT "automationId", COUNT(*)::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "status" = ${SENT} AND "kind" IN (${DM_KINDS}) AND "createdAt" >= ${utcBound(periodStart)}
      GROUP BY 1
    `),
  ]);

  const limit = usage.dms.limit;
  const currentKey = monthKey(periodStart);
  const byMonth = new Map(monthRows.map((r) => [r.month, r]));
  const monthList: UsageMonth[] = [];
  for (let i = 0; i < span; i++) {
    const date = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + i, 1));
    const key = monthKey(date);
    const row = byMonth.get(key);
    const isCurrent = key === currentKey;
    // The live counter is authoritative for the running month; DeliveryLog rebuilds the rest.
    const dmsSent = isCurrent ? usage.dms.used : (row?.dms_sent ?? 0);
    monthList.push({
      month: key,
      label: monthLabel(key),
      dmsSent,
      privateReplies: row?.private_replies ?? 0,
      broadcasts: row?.broadcasts ?? 0,
      publicReplies: row?.public_replies ?? 0,
      limit,
      overagePct: limit > 0 ? dmsSent / limit : 1,
      isCurrent,
    });
  }

  const channelIds = channelRows.map((r) => r.channelId);
  const automationIds = automationRows.map((r) => r.automationId).filter((id): id is string => id !== null);
  const [channels, automations] = await Promise.all([
    channelIds.length > 0
      ? prisma.channel.findMany({ where: { workspaceId, id: { in: channelIds } }, select: { id: true, platform: true, username: true, name: true } })
      : Promise.resolve([]),
    automationIds.length > 0
      ? prisma.automation.findMany({ where: { workspaceId, id: { in: automationIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const automationById = new Map(automations.map((a) => [a.id, a]));

  const perChannel: UsageChannelRow[] = channelRows
    .flatMap((r) => {
      const channel = channelById.get(r.channelId);
      return channel ? [{ channel, used: r.count }] : [];
    })
    .sort((a, b) => b.used - a.used);
  const perAutomation: UsageAutomationRow[] = automationRows
    .flatMap((r) => {
      const automation = r.automationId ? automationById.get(r.automationId) : undefined;
      return automation ? [{ id: automation.id, name: automation.name, used: r.count }] : [];
    })
    .sort((a, b) => b.used - a.used)
    .slice(0, TOP_AUTOMATIONS);
  const broadcasts = monthRows.find((r) => r.month === currentKey)?.broadcasts ?? 0;

  const projection = projectUsage({ used: usage.dms.used, limit, periodStart: usage.periodStart, periodEnd: usage.periodEnd, now });

  return {
    currentPeriod: { ...projection, plan: usage.plan, planLabel: usage.limits.label, perChannel, perAutomation, broadcasts },
    months: monthList,
    warnings: usageWarnings(projection),
  };
}
