/**
 * Workspace analytics for the dashboard.
 *
 * Everything here is read-only and derived from DeliveryLog / FlowSession /
 * Contact / LinkClick rows. Daily series are grouped in SQL in the workspace's
 * timezone so "today" on the chart matches the customer's calendar, and one
 * query covers the current *and* previous period so period totals and deltas
 * fall out of a single O(n) pass over at most 2 × days rows per table.
 */
import {
  AutomationStatus,
  ChannelStatus,
  DeliveryKind,
  DeliveryStatus,
  Prisma,
  type AutomationStatus as AutomationStatusType,
  type ChannelPlatform,
  type ChannelStatus as ChannelStatusType,
  type DeliveryKind as DeliveryKindType,
  type DeliveryStatus as DeliveryStatusType,
} from "@prisma/client";

import { getUsage, type OrganizationUsage } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/workspace/api";
import { customerReason } from "@/lib/errors/customer-messages";

// ───────────────────────── Types ─────────────────────────

export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = 7;

export type OverviewInput = {
  days: AnalyticsPeriod;
  /** Restrict every metric to one channel (must belong to the workspace). */
  channelId?: string;
  /** IANA zone used for day buckets; defaults to the workspace's own timezone. */
  timezone?: string;
};

export type OverviewTotals = {
  dmsSent: number;
  triggered: number;
  publicReplies: number;
  failed: number;
  newContacts: number;
  linkClicks: number;
  /** linkClicks / dmsSent, 0 when nothing was sent. */
  ctr: number;
  activeAutomations: number;
  channels: number;
};

export type DeltaKey = "dmsSent" | "triggered" | "publicReplies" | "failed" | "newContacts" | "linkClicks" | "ctr";

/** (current − previous) / previous; null when the previous period was zero (no baseline). */
export type OverviewDeltas = Record<DeltaKey, number | null>;

export type SeriesPoint = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  sent: number;
  triggered: number;
  failed: number;
  clicks: number;
  newContacts: number;
};

export type ChannelRef = {
  id: string;
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
};

export type TopAutomation = {
  id: string;
  name: string;
  status: AutomationStatusType;
  channel: ChannelRef;
  sent: number;
  clicks: number;
  ctr: number;
};

export type SkipReason = { status: DeliveryStatusType; count: number };

export type ActivityItem = {
  id: string;
  kind: DeliveryKindType;
  status: DeliveryStatusType;
  createdAt: Date;
  recipientUsername: string | null;
  messagePreview: string | null;
  /** Plain-language reason for a skip or failure; null when sent. */
  reason: string | null;
  automation: { id: string; name: string } | null;
  broadcast: { id: string; name: string } | null;
  contact: { id: string; username: string | null; name: string | null } | null;
  channel: ChannelRef;
};

export type SetupProgress = {
  hasChannel: boolean;
  hasAutomation: boolean;
  hasActiveAutomation: boolean;
  hasSentDm: boolean;
};

export type Overview = {
  period: { days: AnalyticsPeriod; start: Date; previousStart: Date; timezone: string };
  channelId: string | null;
  totals: OverviewTotals;
  previous: Omit<OverviewTotals, "activeAutomations" | "channels">;
  deltas: OverviewDeltas;
  series: SeriesPoint[];
  /** The equal-length window before `series`, day for day. */
  previousSeries: SeriesPoint[];
  topAutomations: TopAutomation[];
  skipReasons: SkipReason[];
  recentActivity: ActivityItem[];
  usage: OrganizationUsage;
  setup: SetupProgress;
};

export type ChannelBreakdownRow = ChannelRef & {
  status: ChannelStatusType;
  sent: number;
  triggered: number;
  /** Contacts first seen inside the period. */
  newContacts: number;
  /** All-time contacts on the channel. */
  contacts: number;
};

// ───────────────────────── Period helpers ─────────────────────────

export function isAnalyticsPeriod(value: unknown): value is AnalyticsPeriod {
  return typeof value === "number" && (ANALYTICS_PERIODS as readonly number[]).includes(value);
}

/** Lenient parser for `?days=` — anything unrecognised falls back to the default. */
export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  const n = typeof value === "string" ? Number(value) : value;
  return isAnalyticsPeriod(n) ? n : DEFAULT_ANALYTICS_PERIOD;
}

type LocalDate = { y: number; m: number; d: number };

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function pickPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((p) => p.type === type)?.value ?? 0);
}

function localDateOf(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  return { y: pickPart(parts, "year"), m: pickPart(parts, "month"), d: pickPart(parts, "day") };
}

/** Zone offset (ms east of UTC) in effect at `instant`. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const asUtc = Date.UTC(
    pickPart(parts, "year"),
    pickPart(parts, "month") - 1,
    pickPart(parts, "day"),
    pickPart(parts, "hour"),
    pickPart(parts, "minute"),
    pickPart(parts, "second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which `date` begins in `timeZone`. Two passes absorb a DST change at midnight. */
function localMidnight(date: LocalDate, timeZone: string): Date {
  const naive = Date.UTC(date.y, date.m - 1, date.d);
  let instant = naive - offsetMs(new Date(naive), timeZone);
  instant = naive - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function formatLocalDate(date: LocalDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
}

type PeriodRange = {
  timezone: string;
  /** Local day keys for the previous period followed by the current one (2 × days entries). */
  days: string[];
  currentStartIndex: number;
  currentStart: Date;
  previousStart: Date;
};

function resolveRange(days: AnalyticsPeriod, timezone: string, now = new Date()): PeriodRange {
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  const today = localDateOf(now, tz);
  const currentStartDate = shiftLocalDate(today, -(days - 1));
  const previousStartDate = shiftLocalDate(currentStartDate, -days);
  const keys: string[] = [];
  for (let i = 0; i < days * 2; i++) keys.push(formatLocalDate(shiftLocalDate(previousStartDate, i)));
  return {
    timezone: tz,
    days: keys,
    currentStartIndex: days,
    currentStart: localMidnight(currentStartDate, tz),
    previousStart: localMidnight(previousStartDate, tz),
  };
}

// ───────────────────────── SQL helpers ─────────────────────────

/**
 * Prisma stores `timestamp(3)` columns as UTC wall-clock time. Passing the
 * bound as an ISO string cast to `timestamp` sidesteps the session TimeZone
 * entirely (a timestamptz parameter would be converted through it).
 */
function utcBound(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString()}::timestamp`;
}

/** `YYYY-MM-DD` of a UTC timestamp column in the workspace zone. */
function localDay(column: Prisma.Sql, timezone: string): Prisma.Sql {
  return Prisma.sql`to_char(((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}), 'YYYY-MM-DD')`;
}

type DeliveryDayRow = { day: string; sent: number; public_replies: number; failed: number };
type CountDayRow = { day: string; count: number };

function deliveryByDay(workspaceId: string, range: PeriodRange, channelId?: string): Promise<DeliveryDayRow[]> {
  const channelClause = channelId ? Prisma.sql`AND "channelId" = ${channelId}` : Prisma.empty;
  return prisma.$queryRaw<DeliveryDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`"createdAt"`, range.timezone)} AS day,
      (COUNT(*) FILTER (WHERE "status" = 'SENT'::"DeliveryStatus" AND "kind" <> 'PUBLIC_REPLY'::"DeliveryKind"))::int AS sent,
      (COUNT(*) FILTER (WHERE "status" = 'SENT'::"DeliveryStatus" AND "kind" = 'PUBLIC_REPLY'::"DeliveryKind"))::int AS public_replies,
      (COUNT(*) FILTER (WHERE "status" = 'FAILED'::"DeliveryStatus"))::int AS failed
    FROM "DeliveryLog"
    WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${utcBound(range.previousStart)} ${channelClause}
    GROUP BY 1
  `);
}

/** A FlowSession is created exactly once per trigger match (see engine.startFlowForContact). */
function triggersByDay(workspaceId: string, range: PeriodRange, channelId?: string): Promise<CountDayRow[]> {
  const join = channelId ? Prisma.sql`JOIN "Automation" a ON a."id" = s."automationId"` : Prisma.empty;
  const channelClause = channelId ? Prisma.sql`AND a."channelId" = ${channelId}` : Prisma.empty;
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`s."createdAt"`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM "FlowSession" s ${join}
    WHERE s."workspaceId" = ${workspaceId} AND s."createdAt" >= ${utcBound(range.previousStart)} ${channelClause}
    GROUP BY 1
  `);
}

function newContactsByDay(workspaceId: string, range: PeriodRange, channelId?: string): Promise<CountDayRow[]> {
  const channelClause = channelId ? Prisma.sql`AND "channelId" = ${channelId}` : Prisma.empty;
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`"firstSeenAt"`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM "Contact"
    WHERE "workspaceId" = ${workspaceId} AND "firstSeenAt" >= ${utcBound(range.previousStart)} ${channelClause}
    GROUP BY 1
  `);
}

/** Clicks are attributed to a channel through the link's automation or broadcast; unattached links only count workspace-wide. */
function clicksByDay(workspaceId: string, range: PeriodRange, channelId?: string): Promise<CountDayRow[]> {
  const join = channelId
    ? Prisma.sql`LEFT JOIN "Automation" a ON a."id" = t."automationId" LEFT JOIN "Broadcast" b ON b."id" = t."broadcastId"`
    : Prisma.empty;
  const channelClause = channelId ? Prisma.sql`AND (a."channelId" = ${channelId} OR b."channelId" = ${channelId})` : Prisma.empty;
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`c."createdAt"`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM "LinkClick" c
    JOIN "TrackedLink" t ON t."id" = c."linkId" ${join}
    WHERE t."workspaceId" = ${workspaceId} AND c."createdAt" >= ${utcBound(range.previousStart)} ${channelClause}
    GROUP BY 1
  `);
}

// ───────────────────────── Aggregation ─────────────────────────

type PeriodSums = Omit<OverviewTotals, "activeAutomations" | "channels">;

function emptySums(): PeriodSums {
  return { dmsSent: 0, triggered: 0, publicReplies: 0, failed: 0, newContacts: 0, linkClicks: 0, ctr: 0 };
}

function ratio(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

type SeriesBuild = { series: SeriesPoint[]; previousSeries: SeriesPoint[]; current: PeriodSums; previous: PeriodSums };

/** Fills every day of both periods with zeros, then folds the grouped rows in — O(rows + days). */
function buildSeries(
  range: PeriodRange,
  rows: { delivery: DeliveryDayRow[]; triggers: CountDayRow[]; contacts: CountDayRow[]; clicks: CountDayRow[] },
): SeriesBuild {
  const index = new Map<string, number>();
  const points: Array<SeriesPoint & { publicReplies: number }> = range.days.map((date, i) => {
    index.set(date, i);
    return { date, sent: 0, triggered: 0, failed: 0, clicks: 0, newContacts: 0, publicReplies: 0 };
  });
  const at = (day: string) => {
    const i = index.get(day);
    return i === undefined ? null : points[i];
  };

  for (const r of rows.delivery) {
    const p = at(r.day);
    if (!p) continue;
    p.sent += r.sent;
    p.failed += r.failed;
    p.publicReplies += r.public_replies;
  }
  for (const r of rows.triggers) {
    const p = at(r.day);
    if (p) p.triggered += r.count;
  }
  for (const r of rows.contacts) {
    const p = at(r.day);
    if (p) p.newContacts += r.count;
  }
  for (const r of rows.clicks) {
    const p = at(r.day);
    if (p) p.clicks += r.count;
  }

  const current = emptySums();
  const previous = emptySums();
  points.forEach((p, i) => {
    const target = i >= range.currentStartIndex ? current : previous;
    target.dmsSent += p.sent;
    target.triggered += p.triggered;
    target.publicReplies += p.publicReplies;
    target.failed += p.failed;
    target.newContacts += p.newContacts;
    target.linkClicks += p.clicks;
  });
  current.ctr = rate(current.linkClicks, current.dmsSent);
  previous.ctr = rate(previous.linkClicks, previous.dmsSent);

  const toPoint = ({ date, sent, triggered, failed, clicks, newContacts }: SeriesPoint & { publicReplies: number }): SeriesPoint => ({
    date,
    sent,
    triggered,
    failed,
    clicks,
    newContacts,
  });
  const series = points.slice(range.currentStartIndex).map(toPoint);
  const previousSeries = points.slice(0, range.currentStartIndex).map(toPoint);
  return { series, previousSeries, current, previous };
}

const channelRefSelect = { id: true, platform: true, username: true, name: true } as const;

async function assertChannelInWorkspace(workspaceId: string, channelId: string): Promise<void> {
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true } });
  if (!channel) throw new ApiError(404, "That account isn't connected to this workspace", "NOT_FOUND");
}

async function loadTopAutomations(workspaceId: string, since: Date, channelId?: string): Promise<TopAutomation[]> {
  const grouped = await prisma.deliveryLog.groupBy({
    by: ["automationId"],
    where: {
      workspaceId,
      automationId: { not: null },
      status: DeliveryStatus.SENT,
      kind: { not: DeliveryKind.PUBLIC_REPLY },
      createdAt: { gte: since },
      ...(channelId ? { channelId } : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { automationId: "desc" } },
    take: 5,
  });
  const ids = grouped.map((g) => g.automationId).filter((id): id is string => id !== null);
  if (ids.length === 0) return [];

  const [automations, clickRows] = await Promise.all([
    prisma.automation.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, name: true, status: true, channel: { select: channelRefSelect } },
    }),
    prisma.$queryRaw<Array<{ automationId: string; clicks: number }>>(Prisma.sql`
      SELECT t."automationId" AS "automationId", COUNT(*)::int AS clicks
      FROM "LinkClick" c
      JOIN "TrackedLink" t ON t."id" = c."linkId"
      WHERE t."workspaceId" = ${workspaceId}
        AND t."automationId" IN (${Prisma.join(ids)})
        AND c."createdAt" >= ${utcBound(since)}
      GROUP BY 1
    `),
  ]);

  const byId = new Map(automations.map((a) => [a.id, a]));
  const clicksById = new Map(clickRows.map((r) => [r.automationId, r.clicks]));
  const result: TopAutomation[] = [];
  for (const g of grouped) {
    if (!g.automationId) continue;
    const automation = byId.get(g.automationId);
    if (!automation) continue; // deleted between the two queries
    const sent = g._count._all;
    const clicks = clicksById.get(automation.id) ?? 0;
    result.push({ id: automation.id, name: automation.name, status: automation.status, channel: automation.channel, sent, clicks, ctr: rate(clicks, sent) });
  }
  return result;
}

async function loadSkipReasons(workspaceId: string, since: Date, channelId?: string): Promise<SkipReason[]> {
  const grouped = await prisma.deliveryLog.groupBy({
    by: ["status"],
    where: { workspaceId, status: { not: DeliveryStatus.SENT }, createdAt: { gte: since }, ...(channelId ? { channelId } : {}) },
    _count: { _all: true },
  });
  return grouped.map((g) => ({ status: g.status, count: g._count._all })).sort((a, b) => b.count - a.count);
}

async function loadRecentActivity(workspaceId: string, channelId?: string): Promise<ActivityItem[]> {
  const rows = await prisma.deliveryLog.findMany({
    where: { workspaceId, ...(channelId ? { channelId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      kind: true,
      status: true,
      createdAt: true,
      recipientUsername: true,
      messagePreview: true,
      errorMessage: true,
      automation: { select: { id: true, name: true } },
      broadcast: { select: { id: true, name: true } },
      contact: { select: { id: true, username: true, name: true } },
      channel: { select: channelRefSelect },
    },
  });
  return rows.map(({ errorMessage, ...row }) => ({ ...row, reason: customerReason(row.status, errorMessage) }));
}

// ───────────────────────── Public API ─────────────────────────

export async function getOverview(workspaceId: string, input: OverviewInput): Promise<Overview> {
  const days = isAnalyticsPeriod(input.days) ? input.days : DEFAULT_ANALYTICS_PERIOD;
  const channelId = input.channelId || undefined;
  if (channelId) await assertChannelInWorkspace(workspaceId, channelId);

  const timezone =
    input.timezone ??
    (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } })).timezone;
  const range = resolveRange(days, timezone);

  const [delivery, triggers, contacts, clicks, topAutomations, skipReasons, recentActivity, usage, activeAutomations, channels, anySent] =
    await Promise.all([
      deliveryByDay(workspaceId, range, channelId),
      triggersByDay(workspaceId, range, channelId),
      newContactsByDay(workspaceId, range, channelId),
      clicksByDay(workspaceId, range, channelId),
      loadTopAutomations(workspaceId, range.currentStart, channelId),
      loadSkipReasons(workspaceId, range.currentStart, channelId),
      loadRecentActivity(workspaceId, channelId),
      getUsage(workspaceId),
      prisma.automation.count({ where: { workspaceId, status: AutomationStatus.ACTIVE, ...(channelId ? { channelId } : {}) } }),
      prisma.channel.count({ where: { workspaceId, status: { not: ChannelStatus.DISCONNECTED } } }),
      prisma.deliveryLog.findFirst({
        where: { workspaceId, status: DeliveryStatus.SENT, kind: { not: DeliveryKind.PUBLIC_REPLY } },
        select: { id: true },
      }),
    ]);

  const { series, previousSeries, current, previous } = buildSeries(range, { delivery, triggers, contacts, clicks });

  return {
    period: { days, start: range.currentStart, previousStart: range.previousStart, timezone: range.timezone },
    channelId: channelId ?? null,
    totals: { ...current, activeAutomations, channels },
    previous,
    deltas: {
      dmsSent: ratio(current.dmsSent, previous.dmsSent),
      triggered: ratio(current.triggered, previous.triggered),
      publicReplies: ratio(current.publicReplies, previous.publicReplies),
      failed: ratio(current.failed, previous.failed),
      newContacts: ratio(current.newContacts, previous.newContacts),
      linkClicks: ratio(current.linkClicks, previous.linkClicks),
      ctr: ratio(current.ctr, previous.ctr),
    },
    series,
    previousSeries,
    topAutomations,
    skipReasons,
    recentActivity,
    usage,
    setup: {
      hasChannel: channels > 0,
      hasAutomation: usage.automations.used > 0,
      hasActiveAutomation: activeAutomations > 0,
      hasSentDm: anySent !== null,
    },
  };
}

/** Per-channel sent / triggered / contacts for the period. Disconnected channels are listed too so history stays visible. */
export async function getChannelBreakdown(workspaceId: string, days: AnalyticsPeriod, timezone?: string): Promise<ChannelBreakdownRow[]> {
  const period = isAnalyticsPeriod(days) ? days : DEFAULT_ANALYTICS_PERIOD;
  const tz =
    timezone ?? (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } })).timezone;
  const since = resolveRange(period, tz).currentStart;

  const [channels, sent, triggered, newContacts, contacts] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId },
      select: { ...channelRefSelect, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deliveryLog.groupBy({
      by: ["channelId"],
      where: { workspaceId, status: DeliveryStatus.SENT, kind: { not: DeliveryKind.PUBLIC_REPLY }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ channelId: string; count: number }>>(Prisma.sql`
      SELECT a."channelId" AS "channelId", COUNT(*)::int AS count
      FROM "FlowSession" s
      JOIN "Automation" a ON a."id" = s."automationId"
      WHERE s."workspaceId" = ${workspaceId} AND s."createdAt" >= ${utcBound(since)}
      GROUP BY 1
    `),
    prisma.contact.groupBy({
      by: ["channelId"],
      where: { workspaceId, firstSeenAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.contact.groupBy({ by: ["channelId"], where: { workspaceId }, _count: { _all: true } }),
  ]);

  const sentBy = new Map(sent.map((r) => [r.channelId, r._count._all]));
  const triggeredBy = new Map(triggered.map((r) => [r.channelId, r.count]));
  const newBy = new Map(newContacts.map((r) => [r.channelId, r._count._all]));
  const totalBy = new Map(contacts.map((r) => [r.channelId, r._count._all]));

  return channels.map((c) => ({
    id: c.id,
    platform: c.platform,
    username: c.username,
    name: c.name,
    status: c.status,
    sent: sentBy.get(c.id) ?? 0,
    triggered: triggeredBy.get(c.id) ?? 0,
    newContacts: newBy.get(c.id) ?? 0,
    contacts: totalBy.get(c.id) ?? 0,
  }));
}

// ═════════════════════════ Analytics report (/analytics) ═════════════════════════
//
// Backs the Analytics page and GET /api/analytics. One arbitrary date range
// (capped at ANALYTICS_MAX_RANGE_DAYS) plus optional channel / automation
// filters. Every daily metric is grouped in SQL by local day in the workspace
// timezone, and the previous equal-length window rides along in the same
// queries so period totals and deltas cost no extra round trips. Everything
// in the result is a string or number so the same object crosses the RSC
// boundary and the JSON API unchanged.

export const ANALYTICS_MAX_RANGE_DAYS = 366;
export const ANALYTICS_DEFAULT_RANGE_DAYS = 30;
/** Keyword attribution reads at most this many trigger sessions (newest first). */
const KEYWORD_SAMPLE_LIMIT = 5000;
const TOP_KEYWORDS_LIMIT = 15;
const TOP_AUTOMATIONS_LIMIT = 10;
/** Median first-response time is computed over at most this many inbound threads. */
const RESPONSE_SAMPLE_LIMIT = 20_000;
/**
 * Stage names that meant "lead" before pipelines existed. Audit rows written
 * since then carry the stage position instead: anything past a pipeline's
 * first stage counts.
 */
const LEGACY_LEAD_STAGES = ["Lead", "Customer"] as const;
const DAYS_OF_WEEK = 7;
const HOURS_OF_DAY = 24;

export type AnalyticsInput = {
  /** Local calendar day (YYYY-MM-DD) in the workspace timezone; defaults to `to` − 29 days. */
  from?: string;
  /** Local calendar day (YYYY-MM-DD); defaults to today and is never in the future. */
  to?: string;
  channelId?: string;
  automationId?: string;
  /** IANA zone for day buckets; defaults to the workspace's own timezone. */
  timezone?: string;
};

export type AnalyticsSeriesPoint = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Trigger matches (one FlowSession per matched comment / DM / story reply). */
  comments: number;
  dmsSent: number;
  publicReplies: number;
  clicks: number;
  newContacts: number;
  /** Contacts that moved to a non-"New" stage (see `leadsSource`). */
  leads: number;
  /** Inbound messages. */
  conversations: number;
};

export type AnalyticsTotals = Omit<AnalyticsSeriesPoint, "date"> & {
  /** clicks / dmsSent, 0 when nothing was sent. */
  ctr: number;
};

export type AnalyticsDeltas = Record<keyof AnalyticsTotals, number | null>;

export type FunnelStepKey = "triggered" | "reached" | "responded" | "leads";

export type FunnelStep = {
  key: FunnelStepKey;
  label: string;
  value: number;
  /** value / previous step's value; null on the first step or when the previous step is 0. */
  conversion: number | null;
};

/**
 * People, not events, and every step is a subset of the one before it, so a
 * conversion can never exceed 100%. Broadcasts are excluded: nobody asked for
 * those, so they don't belong in a funnel that starts with a comment.
 */
export type AnalyticsFunnel = {
  /** People who triggered an automation (a keyword comment, DM or story reply). */
  triggered: number;
  /** …who were sent a DM by that automation. */
  reached: number;
  /** …who then clicked an automation's link or replied in the DM. */
  responded: number;
  /** …who have an email, a phone number or a Lead/Customer stage. */
  leads: number;
  steps: FunnelStep[];
};

export type ChannelAnalyticsRow = {
  channel: ChannelRef & { status: ChannelStatusType };
  comments: number;
  dmsSent: number;
  clicks: number;
  ctr: number;
  newContacts: number;
};

export type AutomationAnalyticsRow = {
  automation: { id: string; name: string; status: AutomationStatusType };
  channel: ChannelRef;
  triggered: number;
  sent: number;
  /** Deliveries that did not go out (FAILED plus every SKIPPED_* status). */
  failed: number;
  clicks: number;
  ctr: number;
  /** Contacts who reached the flow's follow gate as followers; null when the flow has no gate. */
  followGateConversions: number | null;
};

export type KeywordCount = { keyword: string; count: number };

export type InboxPerformance = {
  inboundMessages: number;
  humanReplies: number;
  automatedMessages: number;
  /** Minutes from the first inbound message of a thread to the next human reply; null when nothing was answered. */
  medianFirstResponseMinutes: number | null;
  /** automatedMessages / all outbound messages, 0 when nothing went out. */
  automatedShare: number;
  /** Inbound threads that received a human reply (the sample behind the median). */
  answeredThreads: number;
};

export type StageCount = { stageId: string; stage: string; color: string; count: number };

/** Where contacts sit today in one pipeline (stock, not range-bound). */
export type PipelineBreakdown = { pipelineId: string; name: string; total: number; stages: StageCount[] };

export type AnalyticsReport = {
  range: {
    from: string;
    to: string;
    days: number;
    previousFrom: string;
    previousTo: string;
    timezone: string;
    /** UTC instants bounding the current window (ISO). */
    start: string;
    end: string;
  };
  filters: { channelId: string | null; automationId: string | null };
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  deltas: AnalyticsDeltas;
  series: AnalyticsSeriesPoint[];
  /** The equal-length window before `series`, day for day, for comparison lines. */
  previousSeries: AnalyticsSeriesPoint[];
  funnel: AnalyticsFunnel;
  byChannel: ChannelAnalyticsRow[];
  byAutomation: AutomationAnalyticsRow[];
  topKeywords: KeywordCount[];
  skipReasons: SkipReason[];
  /** 7 rows (Sunday first) × 24 hours of trigger counts in the workspace timezone. */
  heatmap: number[][];
  inbox: InboxPerformance;
  /** One entry per pipeline, in pipeline order. */
  pipelines: PipelineBreakdown[];
  /** "audit" when stage changes came from AuditLog `contact.stage_changed`; "contacts" for the updatedAt approximation. */
  leadsSource: "audit" | "contacts";
  /** False until the workspace has ever triggered an automation or logged a delivery — drives the empty state. */
  hasAnyData: boolean;
};

export type AnalyticsFilterOptions = {
  channels: ChannelRef[];
  automations: Array<{ id: string; name: string; channelId: string; status: AutomationStatusType }>;
};

// ───────────────────────── Range ─────────────────────────

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDate(value: string | undefined): LocalDate | null {
  if (!value || !DATE_KEY.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export type AnalyticsRange = {
  timezone: string;
  from: string;
  to: string;
  days: number;
  previousFrom: string;
  previousTo: string;
  /** Local day keys for the previous window followed by the current one (2 × days entries). */
  keys: string[];
  currentStartIndex: number;
  /** UTC instant where the previous window begins. */
  start: Date;
  currentStart: Date;
  /** Exclusive UTC bound: midnight after `to`. */
  end: Date;
};

/**
 * Normalises `from`/`to` into a bounded window: never in the future, never
 * longer than ANALYTICS_MAX_RANGE_DAYS, swapped when reversed. Pure, so the
 * page, the API and the CSV export all agree on what a preset means.
 */
export function resolveAnalyticsRange(input: Pick<AnalyticsInput, "from" | "to">, timezone: string, now = new Date()): AnalyticsRange {
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  const today = localDateOf(now, tz);

  let to = parseLocalDate(input.to) ?? today;
  if (daysBetween(today, to) > 0) to = today;
  let from = parseLocalDate(input.from) ?? shiftLocalDate(to, -(ANALYTICS_DEFAULT_RANGE_DAYS - 1));
  if (daysBetween(today, from) > 0) from = today;
  if (daysBetween(from, to) < 0) [from, to] = [to, from];
  if (daysBetween(from, to) + 1 > ANALYTICS_MAX_RANGE_DAYS) from = shiftLocalDate(to, -(ANALYTICS_MAX_RANGE_DAYS - 1));

  const days = daysBetween(from, to) + 1;
  const previousFrom = shiftLocalDate(from, -days);
  const keys: string[] = [];
  for (let i = 0; i < days * 2; i++) keys.push(formatLocalDate(shiftLocalDate(previousFrom, i)));

  return {
    timezone: tz,
    from: formatLocalDate(from),
    to: formatLocalDate(to),
    days,
    previousFrom: formatLocalDate(previousFrom),
    previousTo: formatLocalDate(shiftLocalDate(from, -1)),
    keys,
    currentStartIndex: days,
    start: localMidnight(previousFrom, tz),
    currentStart: localMidnight(from, tz),
    end: localMidnight(shiftLocalDate(to, 1), tz),
  };
}

// ───────────────────────── Scope predicates ─────────────────────────
//
// Each table reaches the channel / automation differently, so there is one
// predicate builder per table. Aliases are fixed constants (never user input)
// so `Prisma.raw` is safe here.

type Scope = { workspaceId: string; channelId?: string; automationId?: string };

function between(column: Prisma.Sql, range: AnalyticsRange, currentOnly = false): Prisma.Sql {
  return Prisma.sql`${column} >= ${utcBound(currentOnly ? range.currentStart : range.start)} AND ${column} < ${utcBound(range.end)}`;
}

/** DeliveryLog (alias d) carries both ids directly. */
function deliveryScope(s: Scope): Prisma.Sql {
  return Prisma.sql`d."workspaceId" = ${s.workspaceId}
    ${s.channelId ? Prisma.sql`AND d."channelId" = ${s.channelId}` : Prisma.empty}
    ${s.automationId ? Prisma.sql`AND d."automationId" = ${s.automationId}` : Prisma.empty}`;
}

/** FlowSession (alias s) reaches the channel through its automation (alias a). */
function sessionJoin(s: Scope): Prisma.Sql {
  return s.channelId ? Prisma.sql`JOIN "Automation" a ON a."id" = s."automationId"` : Prisma.empty;
}

function sessionScope(s: Scope): Prisma.Sql {
  return Prisma.sql`s."workspaceId" = ${s.workspaceId}
    ${s.channelId ? Prisma.sql`AND a."channelId" = ${s.channelId}` : Prisma.empty}
    ${s.automationId ? Prisma.sql`AND s."automationId" = ${s.automationId}` : Prisma.empty}`;
}

/** Contact (alias c): an automation "owns" the contacts it has ever started a flow for. */
function contactScope(s: Scope): Prisma.Sql {
  return Prisma.sql`c."workspaceId" = ${s.workspaceId}
    ${s.channelId ? Prisma.sql`AND c."channelId" = ${s.channelId}` : Prisma.empty}
    ${
      s.automationId
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM "FlowSession" fs WHERE fs."contactId" = c."id" AND fs."automationId" = ${s.automationId})`
        : Prisma.empty
    }`;
}

/** LinkClick (alias k) → TrackedLink (alias t); the channel comes from the link's automation or broadcast. */
function clickJoin(s: Scope): Prisma.Sql {
  return Prisma.sql`JOIN "TrackedLink" t ON t."id" = k."linkId"
    ${s.channelId ? Prisma.sql`LEFT JOIN "Automation" a ON a."id" = t."automationId" LEFT JOIN "Broadcast" b ON b."id" = t."broadcastId"` : Prisma.empty}`;
}

function clickScope(s: Scope): Prisma.Sql {
  return Prisma.sql`t."workspaceId" = ${s.workspaceId}
    ${s.channelId ? Prisma.sql`AND (a."channelId" = ${s.channelId} OR b."channelId" = ${s.channelId})` : Prisma.empty}
    ${s.automationId ? Prisma.sql`AND t."automationId" = ${s.automationId}` : Prisma.empty}`;
}

/** Message (alias m) → Conversation (alias cv); automations attach through the conversation's contact. */
function conversationScope(s: Scope): Prisma.Sql {
  return Prisma.sql`cv."workspaceId" = ${s.workspaceId}
    ${s.channelId ? Prisma.sql`AND cv."channelId" = ${s.channelId}` : Prisma.empty}
    ${
      s.automationId
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM "FlowSession" fs WHERE fs."contactId" = cv."contactId" AND fs."automationId" = ${s.automationId})`
        : Prisma.empty
    }`;
}

const SENT = Prisma.sql`'SENT'::"DeliveryStatus"`;
const PUBLIC_REPLY = Prisma.sql`'PUBLIC_REPLY'::"DeliveryKind"`;
const INBOUND = Prisma.sql`'INBOUND'::"MessageDirection"`;
const OUTBOUND = Prisma.sql`'OUTBOUND'::"MessageDirection"`;

/** A lead: shared an email or phone number, or sits past the first stage of any pipeline. */
function leadSignal(alias: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(${alias}."email" IS NOT NULL OR ${alias}."phone" IS NOT NULL OR EXISTS (
    SELECT 1 FROM "PipelineEntry" pe JOIN "PipelineStage" ps ON ps."id" = pe."stageId"
    WHERE pe."contactId" = ${alias}."id" AND ps."position" > 0
  ))`;
}

// ───────────────────────── Daily queries (both windows) ─────────────────────────

type ReportDeliveryRow = { day: string; attempted: number; sent: number; public_replies: number };

function reportDeliveriesByDay(scope: Scope, range: AnalyticsRange): Promise<ReportDeliveryRow[]> {
  return prisma.$queryRaw<ReportDeliveryRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`d."createdAt"`, range.timezone)} AS day,
      (COUNT(*) FILTER (WHERE d."kind" <> ${PUBLIC_REPLY}))::int AS attempted,
      (COUNT(*) FILTER (WHERE d."status" = ${SENT} AND d."kind" <> ${PUBLIC_REPLY}))::int AS sent,
      (COUNT(*) FILTER (WHERE d."status" = ${SENT} AND d."kind" = ${PUBLIC_REPLY}))::int AS public_replies
    FROM "DeliveryLog" d
    WHERE ${deliveryScope(scope)} AND ${between(Prisma.sql`d."createdAt"`, range)}
    GROUP BY 1
  `);
}

function reportTriggersByDay(scope: Scope, range: AnalyticsRange): Promise<CountDayRow[]> {
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`s."createdAt"`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM "FlowSession" s ${sessionJoin(scope)}
    WHERE ${sessionScope(scope)} AND ${between(Prisma.sql`s."createdAt"`, range)}
    GROUP BY 1
  `);
}

function reportNewContactsByDay(scope: Scope, range: AnalyticsRange): Promise<CountDayRow[]> {
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`c."firstSeenAt"`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM "Contact" c
    WHERE ${contactScope(scope)} AND ${between(Prisma.sql`c."firstSeenAt"`, range)}
    GROUP BY 1
  `);
}

function reportClicksByDay(scope: Scope, range: AnalyticsRange): Promise<CountDayRow[]> {
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`k."createdAt"`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM "LinkClick" k ${clickJoin(scope)}
    WHERE ${clickScope(scope)} AND ${between(Prisma.sql`k."createdAt"`, range)}
    GROUP BY 1
  `);
}

function reportInboundByDay(scope: Scope, range: AnalyticsRange): Promise<CountDayRow[]> {
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`m."createdAt"`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM "Message" m JOIN "Conversation" cv ON cv."id" = m."conversationId"
    WHERE ${conversationScope(scope)} AND m."direction" = ${INBOUND} AND ${between(Prisma.sql`m."createdAt"`, range)}
    GROUP BY 1
  `);
}

/**
 * Stage changes recorded by the CRM (`contact.stage_changed`, targetId = contact
 * id). Only moves past a pipeline's first stage count: `metadata.toPosition` on
 * current rows, the old Lead/Customer stage names on rows from before pipelines.
 */
function reportLeadsFromAuditByDay(scope: Scope, range: AnalyticsRange): Promise<CountDayRow[]> {
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`first_lead`, range.timezone)} AS day, COUNT(*)::int AS count
    FROM (
      -- The first time each contact entered a lead stage; later moves (Lead -> Customer) don't count again.
      SELECT l."targetId", MIN(l."createdAt") AS first_lead
      FROM "AuditLog" l JOIN "Contact" c ON c."id" = l."targetId"
      WHERE l."workspaceId" = ${scope.workspaceId} AND l."action" = 'contact.stage_changed'
        AND COALESCE(
          (l."metadata"->>'toPosition')::int > 0,
          COALESCE(l."metadata"->>'to', l."metadata"->>'stage', '') IN (${Prisma.join([...LEGACY_LEAD_STAGES])})
        )
        AND ${contactScope(scope)}
      GROUP BY l."targetId"
    ) firsts
    WHERE ${between(Prisma.sql`first_lead`, range)}
    GROUP BY 1
  `);
}

/** Fallback when no stage audit exists yet: contacts whose place past a first stage last changed on that day. */
function reportLeadsFromContactsByDay(scope: Scope, range: AnalyticsRange): Promise<CountDayRow[]> {
  return prisma.$queryRaw<CountDayRow[]>(Prisma.sql`
    SELECT ${localDay(Prisma.sql`pe."updatedAt"`, range.timezone)} AS day, COUNT(DISTINCT pe."contactId")::int AS count
    FROM "PipelineEntry" pe
    JOIN "PipelineStage" ps ON ps."id" = pe."stageId"
    JOIN "Contact" c ON c."id" = pe."contactId"
    WHERE ${contactScope(scope)} AND ps."position" > 0 AND ${between(Prisma.sql`pe."updatedAt"`, range)}
    GROUP BY 1
  `);
}

// ───────────────────────── Current-window breakdowns ─────────────────────────

async function loadFunnel(scope: Scope, range: AnalyticsRange): Promise<AnalyticsFunnel> {
  const [row] = await prisma.$queryRaw<Array<{ triggered: number; reached: number; responded: number; leads: number }>>(Prisma.sql`
    WITH triggered AS (
      SELECT DISTINCT s."contactId" AS id
      FROM "FlowSession" s ${sessionJoin(scope)}
      WHERE ${sessionScope(scope)} AND ${between(Prisma.sql`s."createdAt"`, range, true)}
    ),
    reached AS (
      SELECT DISTINCT d."contactId" AS id
      FROM "DeliveryLog" d
      WHERE ${deliveryScope(scope)} AND d."automationId" IS NOT NULL AND d."status" = ${SENT} AND d."kind" <> ${PUBLIC_REPLY}
        AND ${between(Prisma.sql`d."createdAt"`, range, true)}
        AND d."contactId" IN (SELECT id FROM triggered)
    ),
    responded AS (
      SELECT k."contactId" AS id
      FROM "LinkClick" k ${clickJoin(scope)}
      WHERE ${clickScope(scope)} AND t."automationId" IS NOT NULL AND ${between(Prisma.sql`k."createdAt"`, range, true)}
        AND k."contactId" IN (SELECT id FROM reached)
      UNION
      SELECT cv."contactId" AS id
      FROM "Message" m JOIN "Conversation" cv ON cv."id" = m."conversationId"
      WHERE ${conversationScope(scope)} AND m."direction" = 'INBOUND'::"MessageDirection"
        AND ${between(Prisma.sql`m."createdAt"`, range, true)}
        AND cv."contactId" IN (SELECT id FROM reached)
    )
    SELECT
      (SELECT COUNT(*) FROM triggered)::int AS triggered,
      (SELECT COUNT(*) FROM reached)::int AS reached,
      (SELECT COUNT(*) FROM responded)::int AS responded,
      (SELECT COUNT(*) FROM "Contact" c WHERE c."id" IN (SELECT id FROM responded) AND ${leadSignal(Prisma.sql`c`)})::int AS leads
  `);
  const triggered = row?.triggered ?? 0;
  const reached = row?.reached ?? 0;
  const responded = row?.responded ?? 0;
  const leads = row?.leads ?? 0;

  const values: Array<[FunnelStepKey, string, number]> = [
    ["triggered", "Commented or messaged", triggered],
    ["reached", "Got a DM", reached],
    ["responded", "Clicked or replied", responded],
    ["leads", "Became a lead", leads],
  ];
  const steps: FunnelStep[] = values.map(([key, label, value], i) => {
    const prev = i === 0 ? null : values[i - 1][2];
    return { key, label, value, conversion: prev === null || prev === 0 ? null : value / prev };
  });
  return { triggered, reached, responded, leads, steps };
}

type ChannelCountRow = { channelId: string | null; count: number };

async function loadByChannel(scope: Scope, range: AnalyticsRange): Promise<ChannelAnalyticsRow[]> {
  const [channels, triggers, sent, clicks, newContacts] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId: scope.workspaceId, ...(scope.channelId ? { id: scope.channelId } : {}) },
      select: { ...channelRefSelect, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.$queryRaw<ChannelCountRow[]>(Prisma.sql`
      SELECT a."channelId" AS "channelId", COUNT(*)::int AS count
      FROM "FlowSession" s JOIN "Automation" a ON a."id" = s."automationId"
      WHERE s."workspaceId" = ${scope.workspaceId}
        ${scope.automationId ? Prisma.sql`AND s."automationId" = ${scope.automationId}` : Prisma.empty}
        AND ${between(Prisma.sql`s."createdAt"`, range, true)}
      GROUP BY 1
    `),
    prisma.$queryRaw<ChannelCountRow[]>(Prisma.sql`
      SELECT d."channelId" AS "channelId", COUNT(*)::int AS count
      FROM "DeliveryLog" d
      WHERE ${deliveryScope(scope)} AND d."status" = ${SENT} AND d."kind" <> ${PUBLIC_REPLY}
        AND ${between(Prisma.sql`d."createdAt"`, range, true)}
      GROUP BY 1
    `),
    prisma.$queryRaw<ChannelCountRow[]>(Prisma.sql`
      SELECT COALESCE(a."channelId", b."channelId") AS "channelId", COUNT(*)::int AS count
      FROM "LinkClick" k
      JOIN "TrackedLink" t ON t."id" = k."linkId"
      LEFT JOIN "Automation" a ON a."id" = t."automationId"
      LEFT JOIN "Broadcast" b ON b."id" = t."broadcastId"
      WHERE t."workspaceId" = ${scope.workspaceId}
        ${scope.automationId ? Prisma.sql`AND t."automationId" = ${scope.automationId}` : Prisma.empty}
        AND ${between(Prisma.sql`k."createdAt"`, range, true)}
      GROUP BY 1
    `),
    prisma.$queryRaw<ChannelCountRow[]>(Prisma.sql`
      SELECT c."channelId" AS "channelId", COUNT(*)::int AS count
      FROM "Contact" c
      WHERE ${contactScope({ workspaceId: scope.workspaceId, automationId: scope.automationId })}
        AND ${between(Prisma.sql`c."firstSeenAt"`, range, true)}
      GROUP BY 1
    `),
  ]);

  const index = (rows: ChannelCountRow[]) => new Map(rows.filter((r) => r.channelId).map((r) => [r.channelId as string, r.count]));
  const triggersBy = index(triggers);
  const sentBy = index(sent);
  const clicksBy = index(clicks);
  const newBy = index(newContacts);

  return channels.map((c) => {
    const dmsSent = sentBy.get(c.id) ?? 0;
    const clickCount = clicksBy.get(c.id) ?? 0;
    return {
      channel: { id: c.id, platform: c.platform, username: c.username, name: c.name, status: c.status },
      comments: triggersBy.get(c.id) ?? 0,
      dmsSent,
      clicks: clickCount,
      ctr: rate(clickCount, dmsSent),
      newContacts: newBy.get(c.id) ?? 0,
    };
  });
}

type AutomationDeliveryRow = { automationId: string | null; sent: number; failed: number };
type AutomationCountRow = { automationId: string; count: number };

function flowHasFollowGate(flow: Prisma.JsonValue): boolean {
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) return false;
  const nodes = (flow as { nodes?: unknown }).nodes;
  return Array.isArray(nodes) && nodes.some((n) => typeof n === "object" && n !== null && (n as { type?: unknown }).type === "condition_follow");
}

async function loadByAutomation(scope: Scope, range: AnalyticsRange): Promise<AutomationAnalyticsRow[]> {
  // Candidates come from both tables so an automation whose every DM was
  // skipped (plan limit, window) still shows up next to its trigger count.
  const [deliveries, triggers] = await Promise.all([
    prisma.$queryRaw<AutomationDeliveryRow[]>(Prisma.sql`
      SELECT d."automationId" AS "automationId",
        (COUNT(*) FILTER (WHERE d."status" = ${SENT}))::int AS sent,
        (COUNT(*) FILTER (WHERE d."status" <> ${SENT}))::int AS failed
      FROM "DeliveryLog" d
      WHERE ${deliveryScope(scope)} AND d."automationId" IS NOT NULL AND d."kind" <> ${PUBLIC_REPLY}
        AND ${between(Prisma.sql`d."createdAt"`, range, true)}
      GROUP BY 1
    `),
    prisma.$queryRaw<AutomationCountRow[]>(Prisma.sql`
      SELECT s."automationId" AS "automationId", COUNT(*)::int AS count
      FROM "FlowSession" s ${sessionJoin(scope)}
      WHERE ${sessionScope(scope)} AND ${between(Prisma.sql`s."createdAt"`, range, true)}
      GROUP BY 1
    `),
  ]);

  const stats = new Map<string, { triggered: number; sent: number; failed: number }>();
  for (const r of triggers) stats.set(r.automationId, { triggered: r.count, sent: 0, failed: 0 });
  for (const r of deliveries) {
    if (!r.automationId) continue;
    const s = stats.get(r.automationId) ?? { triggered: 0, sent: 0, failed: 0 };
    s.sent += r.sent;
    s.failed += r.failed;
    stats.set(r.automationId, s);
  }
  const ranked = [...stats.entries()].sort((a, b) => b[1].sent - a[1].sent || b[1].triggered - a[1].triggered).slice(0, TOP_AUTOMATIONS_LIMIT);
  const ids = ranked.map(([id]) => id);
  if (ids.length === 0) return [];

  const [automations, clickRows, followerRows] = await Promise.all([
    prisma.automation.findMany({
      where: { workspaceId: scope.workspaceId, id: { in: ids } },
      select: { id: true, name: true, status: true, flow: true, channel: { select: channelRefSelect } },
    }),
    prisma.$queryRaw<AutomationCountRow[]>(Prisma.sql`
      SELECT t."automationId" AS "automationId", COUNT(*)::int AS count
      FROM "LinkClick" k JOIN "TrackedLink" t ON t."id" = k."linkId"
      WHERE t."workspaceId" = ${scope.workspaceId} AND t."automationId" IN (${Prisma.join(ids)})
        AND ${between(Prisma.sql`k."createdAt"`, range, true)}
      GROUP BY 1
    `),
    // The engine refreshes contact.isFollower at the gate, so "reached the gate
    // as a follower" ≈ passed it (either already following or followed when asked).
    prisma.$queryRaw<AutomationCountRow[]>(Prisma.sql`
      SELECT s."automationId" AS "automationId", COUNT(DISTINCT s."contactId")::int AS count
      FROM "FlowSession" s JOIN "Contact" c ON c."id" = s."contactId"
      WHERE s."workspaceId" = ${scope.workspaceId} AND s."automationId" IN (${Prisma.join(ids)})
        AND c."isFollower" = TRUE AND ${between(Prisma.sql`s."createdAt"`, range, true)}
      GROUP BY 1
    `),
  ]);

  const byId = new Map(automations.map((a) => [a.id, a]));
  const clicksBy = new Map(clickRows.map((r) => [r.automationId, r.count]));
  const followersBy = new Map(followerRows.map((r) => [r.automationId, r.count]));

  const rows: AutomationAnalyticsRow[] = [];
  for (const [id, s] of ranked) {
    const automation = byId.get(id);
    if (!automation) continue; // deleted between the two queries
    const clicks = clicksBy.get(id) ?? 0;
    rows.push({
      automation: { id: automation.id, name: automation.name, status: automation.status },
      channel: automation.channel,
      triggered: s.triggered,
      sent: s.sent,
      failed: s.failed,
      clicks,
      ctr: rate(clicks, s.sent),
      followGateConversions: flowHasFollowGate(automation.flow) ? (followersBy.get(id) ?? 0) : null,
    });
  }
  return rows;
}

function triggerTextOf(context: Prisma.JsonValue): string | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const text = (context as { triggerText?: unknown }).triggerText;
  return typeof text === "string" ? text : null;
}

/**
 * Keyword attribution is approximate: the trigger text saved on each session
 * is matched against its automation's keywords (case-insensitive contains);
 * sessions whose text matches nothing spread one count evenly across the
 * automation's keywords. Match-anything automations (no keywords) are left out.
 */
async function loadTopKeywords(scope: Scope, range: AnalyticsRange): Promise<KeywordCount[]> {
  const sessions = await prisma.flowSession.findMany({
    where: {
      workspaceId: scope.workspaceId,
      createdAt: { gte: range.currentStart, lt: range.end },
      ...(scope.automationId ? { automationId: scope.automationId } : {}),
      ...(scope.channelId ? { automation: { channelId: scope.channelId } } : {}),
    },
    select: { automationId: true, context: true },
    orderBy: { createdAt: "desc" },
    take: KEYWORD_SAMPLE_LIMIT,
  });
  if (sessions.length === 0) return [];

  const automationIds = [...new Set(sessions.map((s) => s.automationId))];
  const automations = await prisma.automation.findMany({
    where: { workspaceId: scope.workspaceId, id: { in: automationIds } },
    select: { id: true, keywords: true },
  });
  const keywordsBy = new Map(automations.map((a) => [a.id, a.keywords.map((k) => k.trim()).filter(Boolean)]));

  const counts = new Map<string, number>();
  const bump = (keyword: string, by: number) => counts.set(keyword, (counts.get(keyword) ?? 0) + by);
  for (const s of sessions) {
    const keywords = keywordsBy.get(s.automationId);
    if (!keywords || keywords.length === 0) continue;
    const text = triggerTextOf(s.context)?.toLowerCase() ?? "";
    const matched = text ? keywords.filter((k) => text.includes(k.toLowerCase())) : [];
    if (matched.length > 0) matched.forEach((k) => bump(k, 1));
    else keywords.forEach((k) => bump(k, 1 / keywords.length));
  }
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count: Math.round(count) }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, TOP_KEYWORDS_LIMIT);
}

async function loadReportSkipReasons(scope: Scope, range: AnalyticsRange): Promise<SkipReason[]> {
  const grouped = await prisma.deliveryLog.groupBy({
    by: ["status"],
    where: {
      workspaceId: scope.workspaceId,
      status: { not: DeliveryStatus.SENT },
      createdAt: { gte: range.currentStart, lt: range.end },
      ...(scope.channelId ? { channelId: scope.channelId } : {}),
      ...(scope.automationId ? { automationId: scope.automationId } : {}),
    },
    _count: { _all: true },
  });
  return grouped.map((g) => ({ status: g.status, count: g._count._all })).sort((a, b) => b.count - a.count);
}

type HeatmapRow = { dow: number; hour: number; count: number };

async function loadHeatmap(scope: Scope, range: AnalyticsRange): Promise<number[][]> {
  const rows = await prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
    SELECT EXTRACT(DOW FROM x.ts)::int AS dow, EXTRACT(HOUR FROM x.ts)::int AS hour, COUNT(*)::int AS count
    FROM (
      SELECT ((s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${range.timezone}) AS ts
      FROM "FlowSession" s ${sessionJoin(scope)}
      WHERE ${sessionScope(scope)} AND ${between(Prisma.sql`s."createdAt"`, range, true)}
    ) x
    GROUP BY 1, 2
  `);
  const grid: number[][] = Array.from({ length: DAYS_OF_WEEK }, () => Array.from({ length: HOURS_OF_DAY }, () => 0));
  for (const r of rows) {
    if (r.dow >= 0 && r.dow < DAYS_OF_WEEK && r.hour >= 0 && r.hour < HOURS_OF_DAY) grid[r.dow][r.hour] += r.count;
  }
  return grid;
}

type InboxCountRow = { inbound: number; human: number; automated: number };
type ResponseRow = { median_seconds: number | null; answered: number };

async function loadInboxPerformance(scope: Scope, range: AnalyticsRange): Promise<InboxPerformance> {
  const [[counts], [response]] = await Promise.all([
    prisma.$queryRaw<InboxCountRow[]>(Prisma.sql`
      SELECT
        (COUNT(*) FILTER (WHERE m."direction" = ${INBOUND}))::int AS inbound,
        (COUNT(*) FILTER (WHERE m."direction" = ${OUTBOUND} AND m."sentByUserId" IS NOT NULL))::int AS human,
        (COUNT(*) FILTER (WHERE m."direction" = ${OUTBOUND} AND m."sentByUserId" IS NULL))::int AS automated
      FROM "Message" m JOIN "Conversation" cv ON cv."id" = m."conversationId"
      WHERE ${conversationScope(scope)} AND ${between(Prisma.sql`m."createdAt"`, range, true)}
    `),
    // A "thread" starts at an inbound message not immediately preceded by
    // another inbound one; its response time is the gap to the next human
    // reply in the same conversation. Threads never answered by a human are
    // excluded, so the median describes the replies that did happen.
    prisma.$queryRaw<ResponseRow[]>(Prisma.sql`
      WITH msgs AS (
        SELECT m."conversationId", m."direction", m."createdAt",
          LAG(m."direction") OVER (PARTITION BY m."conversationId" ORDER BY m."createdAt", m."id") AS prev_direction
        FROM "Message" m JOIN "Conversation" cv ON cv."id" = m."conversationId"
        WHERE ${conversationScope(scope)} AND ${between(Prisma.sql`m."createdAt"`, range, true)}
      ),
      starts AS (
        SELECT "conversationId", "createdAt" FROM msgs
        WHERE "direction" = ${INBOUND} AND (prev_direction IS NULL OR prev_direction <> ${INBOUND})
        ORDER BY "createdAt" DESC
        LIMIT ${RESPONSE_SAMPLE_LIMIT}
      )
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r."createdAt" - st."createdAt"))::double precision) AS median_seconds,
        COUNT(*)::int AS answered
      FROM starts st
      JOIN LATERAL (
        SELECT m2."createdAt" FROM "Message" m2
        WHERE m2."conversationId" = st."conversationId" AND m2."direction" = ${OUTBOUND}
          AND m2."sentByUserId" IS NOT NULL AND m2."createdAt" > st."createdAt"
        ORDER BY m2."createdAt" ASC
        LIMIT 1
      ) r ON TRUE
    `),
  ]);

  const inbound = counts?.inbound ?? 0;
  const human = counts?.human ?? 0;
  const automated = counts?.automated ?? 0;
  const medianSeconds = response?.median_seconds;
  return {
    inboundMessages: inbound,
    humanReplies: human,
    automatedMessages: automated,
    medianFirstResponseMinutes: typeof medianSeconds === "number" && Number.isFinite(medianSeconds) ? Math.round(medianSeconds / 60) : null,
    automatedShare: rate(automated, automated + human),
    answeredThreads: response?.answered ?? 0,
  };
}

/** Stock (not range-bound) counts per stage for every pipeline, honouring the account and automation filters. */
async function loadPipelineBreakdowns(scope: Scope): Promise<PipelineBreakdown[]> {
  const [pipelines, grouped] = await Promise.all([
    prisma.pipeline.findMany({
      where: { workspaceId: scope.workspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, stages: { orderBy: { position: "asc" }, select: { id: true, name: true, color: true } } },
    }),
    prisma.pipelineEntry.groupBy({
      by: ["stageId"],
      where: {
        workspaceId: scope.workspaceId,
        ...(scope.channelId || scope.automationId
          ? {
              contact: {
                ...(scope.channelId ? { channelId: scope.channelId } : {}),
                ...(scope.automationId ? { flowSessions: { some: { automationId: scope.automationId } } } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(grouped.map((g) => [g.stageId, g._count._all]));
  return pipelines.map((p) => {
    const stages = p.stages.map((st) => ({ stageId: st.id, stage: st.name, color: st.color, count: counts.get(st.id) ?? 0 }));
    return { pipelineId: p.id, name: p.name, total: stages.reduce((sum, st) => sum + st.count, 0), stages };
  });
}

// ───────────────────────── Series assembly ─────────────────────────

type ReportRows = {
  delivery: ReportDeliveryRow[];
  triggers: CountDayRow[];
  contacts: CountDayRow[];
  clicks: CountDayRow[];
  inbound: CountDayRow[];
  leads: CountDayRow[];
};

type ReportPoint = AnalyticsSeriesPoint & { attempted: number };

function emptyTotals(): AnalyticsTotals {
  return { comments: 0, dmsSent: 0, publicReplies: 0, clicks: 0, newContacts: 0, leads: 0, conversations: 0, ctr: 0 };
}

function buildReportSeries(range: AnalyticsRange, rows: ReportRows): { series: AnalyticsSeriesPoint[]; previousSeries: AnalyticsSeriesPoint[]; current: AnalyticsTotals; previous: AnalyticsTotals; attempted: number } {
  const index = new Map<string, number>();
  const points: ReportPoint[] = range.keys.map((date, i) => {
    index.set(date, i);
    return { date, comments: 0, dmsSent: 0, publicReplies: 0, clicks: 0, newContacts: 0, leads: 0, conversations: 0, attempted: 0 };
  });
  const at = (day: string): ReportPoint | null => {
    const i = index.get(day);
    return i === undefined ? null : points[i];
  };
  const fold = (list: CountDayRow[], key: keyof Omit<ReportPoint, "date">) => {
    for (const r of list) {
      const p = at(r.day);
      if (p) p[key] += r.count;
    }
  };
  for (const r of rows.delivery) {
    const p = at(r.day);
    if (!p) continue;
    p.dmsSent += r.sent;
    p.publicReplies += r.public_replies;
    p.attempted += r.attempted;
  }
  fold(rows.triggers, "comments");
  fold(rows.contacts, "newContacts");
  fold(rows.clicks, "clicks");
  fold(rows.inbound, "conversations");
  fold(rows.leads, "leads");

  const current = emptyTotals();
  const previous = emptyTotals();
  let attempted = 0;
  points.forEach((p, i) => {
    const target = i >= range.currentStartIndex ? current : previous;
    target.comments += p.comments;
    target.dmsSent += p.dmsSent;
    target.publicReplies += p.publicReplies;
    target.clicks += p.clicks;
    target.newContacts += p.newContacts;
    target.leads += p.leads;
    target.conversations += p.conversations;
    if (i >= range.currentStartIndex) attempted += p.attempted;
  });
  current.ctr = rate(current.clicks, current.dmsSent);
  previous.ctr = rate(previous.clicks, previous.dmsSent);

  const strip = ({ attempted: _attempted, ...point }: ReportPoint): AnalyticsSeriesPoint => point;
  const series = points.slice(range.currentStartIndex).map(strip);
  const previousSeries = points.slice(0, range.currentStartIndex).map(strip);
  return { series, previousSeries, current, previous, attempted };
}

async function resolveScope(workspaceId: string, input: Pick<AnalyticsInput, "channelId" | "automationId">): Promise<Scope> {
  const channelId = input.channelId || undefined;
  const automationId = input.automationId || undefined;
  if (channelId) await assertChannelInWorkspace(workspaceId, channelId);
  if (automationId) {
    const automation = await prisma.automation.findFirst({ where: { id: automationId, workspaceId }, select: { id: true } });
    if (!automation) throw new ApiError(404, "Automation not found", "NOT_FOUND");
  }
  return { workspaceId, channelId, automationId };
}

async function workspaceSettings(workspaceId: string, timezone?: string): Promise<{ timezone: string }> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } });
  return { timezone: timezone ?? ws.timezone };
}

// ───────────────────────── Public API ─────────────────────────

export async function getAnalytics(workspaceId: string, input: AnalyticsInput = {}): Promise<AnalyticsReport> {
  const [scope, settings] = await Promise.all([resolveScope(workspaceId, input), workspaceSettings(workspaceId, input.timezone)]);
  const range = resolveAnalyticsRange(input, settings.timezone);

  const [delivery, triggers, contacts, clicks, inbound, leadsAudit, leadsContacts, byChannel, byAutomation, topKeywords, skipReasons, heatmap, inbox, pipelines, anySession, anyDelivery] =
    await Promise.all([
      reportDeliveriesByDay(scope, range),
      reportTriggersByDay(scope, range),
      reportNewContactsByDay(scope, range),
      reportClicksByDay(scope, range),
      reportInboundByDay(scope, range),
      reportLeadsFromAuditByDay(scope, range),
      reportLeadsFromContactsByDay(scope, range),
      loadByChannel(scope, range),
      loadByAutomation(scope, range),
      loadTopKeywords(scope, range),
      loadReportSkipReasons(scope, range),
      loadHeatmap(scope, range),
      loadInboxPerformance(scope, range),
      loadPipelineBreakdowns(scope),
      prisma.flowSession.findFirst({ where: { workspaceId }, select: { id: true } }),
      prisma.deliveryLog.findFirst({ where: { workspaceId }, select: { id: true } }),
    ]);

  // Prefer the CRM's explicit stage-change audit; fall back to the updatedAt approximation only when none exists.
  const leadsSource: AnalyticsReport["leadsSource"] = leadsAudit.length > 0 ? "audit" : "contacts";
  const { series, previousSeries, current, previous } = buildReportSeries(range, {
    delivery,
    triggers,
    contacts,
    clicks,
    inbound,
    leads: leadsSource === "audit" ? leadsAudit : leadsContacts,
  });
  const funnel = await loadFunnel(scope, range);

  const deltas: AnalyticsDeltas = {
    comments: ratio(current.comments, previous.comments),
    dmsSent: ratio(current.dmsSent, previous.dmsSent),
    publicReplies: ratio(current.publicReplies, previous.publicReplies),
    clicks: ratio(current.clicks, previous.clicks),
    newContacts: ratio(current.newContacts, previous.newContacts),
    leads: ratio(current.leads, previous.leads),
    conversations: ratio(current.conversations, previous.conversations),
    ctr: ratio(current.ctr, previous.ctr),
  };

  return {
    range: {
      from: range.from,
      to: range.to,
      days: range.days,
      previousFrom: range.previousFrom,
      previousTo: range.previousTo,
      timezone: range.timezone,
      start: range.currentStart.toISOString(),
      end: range.end.toISOString(),
    },
    filters: { channelId: scope.channelId ?? null, automationId: scope.automationId ?? null },
    totals: current,
    previous,
    deltas,
    series,
    previousSeries,
    funnel,
    byChannel,
    byAutomation,
    topKeywords,
    skipReasons,
    heatmap,
    inbox,
    pipelines,
    leadsSource,
    hasAnyData: anySession !== null || anyDelivery !== null,
  };
}

/** Just the funnel for the dashboard card — four small queries instead of the whole report. */
export async function getAnalyticsFunnel(workspaceId: string, input: AnalyticsInput = {}): Promise<AnalyticsFunnel & { range: Pick<AnalyticsRange, "from" | "to" | "days"> }> {
  const [scope, settings] = await Promise.all([resolveScope(workspaceId, input), workspaceSettings(workspaceId, input.timezone)]);
  const range = resolveAnalyticsRange(input, settings.timezone);
  const funnel = await loadFunnel(scope, range);
  return { ...funnel, range: { from: range.from, to: range.to, days: range.days } };
}

/** Channel + automation lists for the Analytics filter controls (disconnected channels included so history stays reachable). */
export async function getAnalyticsFilterOptions(workspaceId: string): Promise<AnalyticsFilterOptions> {
  const [channels, automations] = await Promise.all([
    prisma.channel.findMany({ where: { workspaceId }, select: channelRefSelect, orderBy: { createdAt: "asc" } }),
    prisma.automation.findMany({
      where: { workspaceId },
      select: { id: true, name: true, channelId: true, status: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
  ]);
  return { channels, automations };
}

const CSV_COLUMNS: Array<{ header: string; key: keyof AnalyticsSeriesPoint }> = [
  { header: "date", key: "date" },
  { header: "comments", key: "comments" },
  { header: "dms_sent", key: "dmsSent" },
  { header: "public_replies", key: "publicReplies" },
  { header: "clicks", key: "clicks" },
  { header: "new_contacts", key: "newContacts" },
  { header: "leads", key: "leads" },
  { header: "conversations", key: "conversations" },
];

/** Daily series as CSV (one row per local day, oldest first). Values are dates and integers, so no quoting is needed. */
export async function exportAnalyticsCsv(workspaceId: string, input: AnalyticsInput = {}): Promise<{ filename: string; csv: string }> {
  const report = await getAnalytics(workspaceId, input);
  const lines = [CSV_COLUMNS.map((c) => c.header).join(",")];
  for (const point of report.series) lines.push(CSV_COLUMNS.map((c) => String(point[c.key])).join(","));
  return { filename: `analytics-${report.range.from}-to-${report.range.to}.csv`, csv: `${lines.join("\n")}\n` };
}
