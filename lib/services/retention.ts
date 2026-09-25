/**
 * Data retention: what we delete, and when.
 *
 * - Webhook receipts: processed ones after WEBHOOK_EVENT_RETENTION_DAYS. They
 *   only exist to spot a delivery Meta sends twice, which it does within a day;
 *   after that `Message.externalId` still blocks a duplicate.
 * - Delivery logs and conversation messages: after the organization's plan
 *   history (`PlanLimits.historyDays`), but never inside the current billing
 *   month, so the usage page always adds up. A lapsed or cancelled
 *   subscription keeps its paid window for a while first (`historyPlan`).
 * - Audit logs: after AUDIT_LOG_RETENTION_DAYS. Analytics never reads further
 *   back than a year, and for that year they are the security history.
 *
 * Contacts, conversations, automations, flow sessions and broadcast totals are
 * kept. "Once per contact" reads AutomationRecipient, and past months of the
 * usage history read UsageMonthTotal, which is written here before a month's
 * logs can go. Neither is pruned. A flow session nothing will ever resume is
 * not deleted either, only marked EXPIRED (`expireIdleSessions`).
 *
 * Deletes run in small batches so no statement holds locks for long, and stop
 * at a deadline so a serverless cron run finishes in time; the next run picks
 * up where this one stopped.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { MAX_DELAY_SECONDS } from "@/lib/automation/flow-types";
import { BILLING_FIELDS_SELECT, historyPlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { currentPeriodStart, historyCutoff } from "@/lib/billing/usage";
import { logger } from "@/lib/logger";
import { pruneCompletedJobs, pruneFailedJobs } from "@/lib/queue";
import { pruneRateLimitWindows } from "@/lib/rate-limit";
import { pruneRequestRateLimits } from "@/lib/security/rate-limit-ip";
import { purgeExpiredOAuthRows } from "@/lib/services/oauth";

export const WEBHOOK_EVENT_RETENTION_DAYS = 15;
export const FAILED_JOB_RETENTION_DAYS = 15;
export const AUDIT_LOG_RETENTION_DAYS = 365;

const DAY_MS = 24 * 3600 * 1000;
const DELETE_BATCH = 5000;
const ORGANIZATION_PAGE = 100;
/**
 * An ACTIVE session untouched this long is over: the engine stops resuming a
 * session after a week, and a day past the longest delay step no delay can be
 * about to wake it.
 */
const IDLE_SESSION_MS = MAX_DELAY_SECONDS * 1000 + DAY_MS;

/** A UTC instant as a `timestamp` literal: the columns carry no zone, so a timestamptz parameter would be shifted by the session zone. */
function utc(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString()}::timestamp`;
}

/** Runs `step` until it touches less than a full batch or the deadline passes. Returns the rows touched. */
async function inBatches(step: () => Promise<number>, deadline: number): Promise<number> {
  let total = 0;
  while (Date.now() < deadline) {
    const touched = await step();
    total += touched;
    if (touched < DELETE_BATCH) break;
  }
  return total;
}

/**
 * Events never processed (a comment held for an account that was never
 * reconnected, an event that kept failing) are kept twice as long, for
 * debugging, then go too: past Meta's 7-day private-reply window nothing can
 * be done with them.
 */
const UNPROCESSED_WEBHOOK_RETENTION_DAYS = WEBHOOK_EVENT_RETENTION_DAYS * 2;

export async function pruneWebhookEvents(deadline: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * DAY_MS);
  const unprocessedCutoff = new Date(now.getTime() - UNPROCESSED_WEBHOOK_RETENTION_DAYS * DAY_MS);
  return inBatches(
    () =>
      prisma.$executeRaw(Prisma.sql`
        DELETE FROM "WebhookEvent" WHERE "id" IN (
          SELECT "id" FROM "WebhookEvent"
          WHERE ("processed" = true AND "createdAt" < ${utc(cutoff)}) OR "createdAt" < ${utc(unprocessedCutoff)}
          LIMIT ${DELETE_BATCH}
        )`),
    deadline,
  );
}

/**
 * Marks EXPIRED the ACTIVE sessions untouched for IDLE_SESSION_MS that have no
 * step queued or running: a question nobody answered, a flow whose last job
 * gave up. The engine already ignores them; this stops them showing as live
 * and keeps the ACTIVE part of the table small. `updatedAt` is left as it is,
 * so it still says when the session last did anything, and the conditions are
 * repeated on the outer UPDATE so a session touched meanwhile is skipped.
 */
export async function expireIdleSessions(deadline: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - IDLE_SESSION_MS);
  return inBatches(
    () =>
      prisma.$executeRaw(Prisma.sql`
        UPDATE "FlowSession"
        SET "status" = 'EXPIRED'::"FlowSessionStatus",
            "context" = CASE WHEN jsonb_typeof("context") = 'object' THEN "context" || '{"lastError":"idle"}'::jsonb ELSE "context" END
        WHERE "status" = 'ACTIVE'::"FlowSessionStatus" AND "updatedAt" < ${utc(cutoff)} AND "id" IN (
          SELECT s."id" FROM "FlowSession" s
          WHERE s."status" = 'ACTIVE'::"FlowSessionStatus" AND s."updatedAt" < ${utc(cutoff)}
            AND NOT EXISTS (
              SELECT 1 FROM "Job" j
              WHERE j."status" IN ('PENDING'::"JobStatus", 'PROCESSING'::"JobStatus")
                AND j."type" = 'EXECUTE_FLOW'::"JobType"
                AND j."payload"->>'sessionId' = s."id"
            )
          LIMIT ${DELETE_BATCH}
        )`),
    deadline,
  );
}

export async function pruneAuditLogs(deadline: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * DAY_MS);
  return inBatches(
    () =>
      prisma.$executeRaw(Prisma.sql`
        DELETE FROM "AuditLog" WHERE "id" IN (
          SELECT "id" FROM "AuditLog" WHERE "createdAt" < ${utc(cutoff)} LIMIT ${DELETE_BATCH}
        )`),
    deadline,
  );
}

function pruneDeliveryLogs(workspaceIds: string[], cutoff: Date, deadline: number): Promise<number> {
  return inBatches(
    () =>
      prisma.$executeRaw(Prisma.sql`
        DELETE FROM "DeliveryLog" WHERE "id" IN (
          SELECT "id" FROM "DeliveryLog"
          WHERE "workspaceId" = ANY(${workspaceIds}::text[]) AND "createdAt" < ${utc(cutoff)}
          LIMIT ${DELETE_BATCH}
        )`),
    deadline,
  );
}

function pruneMessages(workspaceIds: string[], cutoff: Date, deadline: number): Promise<number> {
  return inBatches(
    () =>
      prisma.$executeRaw(Prisma.sql`
        DELETE FROM "Message" WHERE "id" IN (
          SELECT m."id" FROM "Message" m
          JOIN "Conversation" c ON c."id" = m."conversationId"
          WHERE c."workspaceId" = ANY(${workspaceIds}::text[]) AND m."createdAt" < ${utc(cutoff)}
          LIMIT ${DELETE_BATCH}
        )`),
    deadline,
  );
}

/**
 * Writes the DM totals of every finished month the organization has no
 * total for yet. Runs before its logs are pruned; the first run on an
 * organization reads all of its past logs, later ones only the month that
 * just ended.
 */
async function snapshotUsageMonths(organizationId: string, workspaceIds: string[], now: Date): Promise<number> {
  const latest = await prisma.usageMonthTotal.findFirst({ where: { organizationId }, orderBy: { month: "desc" }, select: { month: true } });
  const periodStart = currentPeriodStart(now);
  const from = latest ? new Date(Date.UTC(Number(latest.month.slice(0, 4)), Number(latest.month.slice(5, 7)), 1)) : null;
  if (from && from >= periodStart) return 0;
  const fromClause = from ? Prisma.sql`AND "createdAt" >= ${utc(from)}` : Prisma.empty;
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "UsageMonthTotal" ("organizationId", "month", "dmsSent", "privateReplies", "messages", "broadcasts", "publicReplies")
    SELECT ${organizationId}, to_char(date_trunc('month', "createdAt"), 'YYYY-MM'),
      (COUNT(*) FILTER (WHERE "kind" <> 'PUBLIC_REPLY'::"DeliveryKind"))::int,
      (COUNT(*) FILTER (WHERE "kind" = 'PRIVATE_REPLY'::"DeliveryKind"))::int,
      (COUNT(*) FILTER (WHERE "kind" = 'MESSAGE'::"DeliveryKind"))::int,
      (COUNT(*) FILTER (WHERE "kind" = 'BROADCAST'::"DeliveryKind"))::int,
      (COUNT(*) FILTER (WHERE "kind" = 'PUBLIC_REPLY'::"DeliveryKind"))::int
    FROM "DeliveryLog"
    WHERE "workspaceId" = ANY(${workspaceIds}::text[]) AND "status" = 'SENT'::"DeliveryStatus"
      AND "createdAt" < ${utc(periodStart)} ${fromClause}
    GROUP BY 2
    ON CONFLICT DO NOTHING`);
}

export type HistoryPruneResult = { organizations: number; deliveryLogs: number; messages: number; finished: boolean };

/** Deletes delivery logs and messages older than each organization's history window, after saving past months' totals. */
export async function pruneHistory(deadline: number, now = new Date()): Promise<HistoryPruneResult> {
  const result: HistoryPruneResult = { organizations: 0, deliveryLogs: 0, messages: 0, finished: false };
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.organization.findMany({
      select: { id: true, ...BILLING_FIELDS_SELECT, workspaces: { select: { id: true } } },
      orderBy: { id: "asc" },
      take: ORGANIZATION_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) {
      result.finished = true;
      return result;
    }

    for (const org of page) {
      if (Date.now() >= deadline) return result;
      const workspaceIds = org.workspaces.map((w) => w.id);
      if (workspaceIds.length === 0) continue;
      const cutoff = historyCutoff(limitsFor(historyPlan(org, now)).historyDays, now);
      await snapshotUsageMonths(org.id, workspaceIds, now);
      result.deliveryLogs += await pruneDeliveryLogs(workspaceIds, cutoff, deadline);
      result.messages += await pruneMessages(workspaceIds, cutoff, deadline);
      result.organizations++;
    }
    cursor = page[page.length - 1].id;
  }
}

export type HousekeepingResult = {
  completedJobs: number;
  failedJobs: number;
  rateWindows: number;
  requestRateLimits: number;
  oauth: { codes: number; tokens: number };
  webhookEvents: number;
  /** Idle flow sessions marked EXPIRED. */
  expiredSessions: number;
  auditLogs: number;
  history: HistoryPruneResult;
};

/**
 * Everything the worker (every few hours) and `/api/cron/housekeeping` (daily,
 * for deployments without a worker) clean up. Safe to run concurrently: every
 * step is a plain delete of rows nothing reads any more, or ends sessions
 * nothing will resume.
 */
export async function runHousekeeping(budgetMs: number, now = new Date()): Promise<HousekeepingResult> {
  const deadline = Date.now() + budgetMs;
  const [completedJobs, failedJobs, rateWindows, requestRateLimits, oauth] = await Promise.all([
    pruneCompletedJobs(),
    pruneFailedJobs(FAILED_JOB_RETENTION_DAYS * DAY_MS),
    pruneRateLimitWindows(),
    pruneRequestRateLimits(),
    // Also run by the cron tick; a deployment with only a worker needs it here.
    purgeExpiredOAuthRows(now),
  ]);
  const webhookEvents = await pruneWebhookEvents(deadline, now);
  const expiredSessions = await expireIdleSessions(deadline, now);
  const auditLogs = await pruneAuditLogs(deadline, now);
  const history = await pruneHistory(deadline, now);
  const result = { completedJobs, failedJobs, rateWindows, requestRateLimits, oauth, webhookEvents, expiredSessions, auditLogs, history };
  logger.info("housekeeping.done", result);
  return result;
}
