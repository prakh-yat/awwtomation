/**
 * Alerts for whoever runs this deployment, not for customers.
 *
 * `checkQueueHealth` runs from the worker heartbeat and from every cron tick,
 * so it notices a queue that stops moving while one of them is still alive: a
 * worker whose jobs hang, a tick that cannot keep up, a database that refuses
 * the claims. A worker that is not running at all, on a host without the
 * cron, calls nothing; an uptime monitor on /api/health/queue catches that.
 */
import { brand } from "@/lib/brand";
import { sendEmail } from "@/lib/email";
import { appUrl, optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getQueueStats, type QueueStats } from "@/lib/queue";
import { checkRateLimit } from "@/lib/security/rate-limit-ip";

const DEFAULT_ALERT_AFTER_SECONDS = 300;
const ALERT_EVERY_MS = 3_600_000;

/**
 * QUEUE_ALERT_AFTER_SECONDS, read without throwing: /api/health/queue has to
 * answer even when some unrelated setting is missing or invalid.
 */
export function queueAlertAfterSeconds(): number {
  const configured = Number(optionalEnv("QUEUE_ALERT_AFTER_SECONDS"));
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ALERT_AFTER_SECONDS;
}

/** True once the oldest job that is due has waited longer than QUEUE_ALERT_AFTER_SECONDS. */
export function isQueueStalled(stats: QueueStats): boolean {
  return stats.oldestDueSeconds > queueAlertAfterSeconds();
}

function describeWait(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 360) / 10} hours`;
}

/** Which deployment is writing, for whoever runs more than one. */
function deploymentHost(): string {
  const url = appUrl();
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function stalledEmail(stats: QueueStats, alertAfterSeconds: number): { subject: string; text: string } {
  const host = deploymentHost();
  const waited = describeWait(stats.oldestDueSeconds);
  const text = [
    `Jobs on ${host} are waiting too long to run. The oldest one that is due has waited ${waited}; this alert goes off after ${describeWait(alertAfterSeconds)}.`,
    "",
    `Due now: ${stats.due}`,
    `Pending, including jobs scheduled for later: ${stats.pending}`,
    `Processing: ${stats.processing}`,
    `Failed in the last day: ${stats.failedLastDay}`,
    "",
    "What to check:",
    "- The worker process (npm run worker) is running. It logs worker.heartbeat every five minutes.",
    "- On a host without a worker, the cron that calls /api/cron/tick every minute with CRON_SECRET is running and getting 200s.",
    "- If they are, look for queue.job_failed and worker.claim_error in the logs: the database may be refusing connections, or jobs may be hanging.",
    "",
    `Queue status: ${appUrl("/api/health/queue")}`,
    "",
    "This alert is sent at most once an hour.",
  ].join("\n");
  return { subject: `${brand.name} job queue stalled on ${host} (${waited})`, text };
}

export type QueueHealth = { stalled: boolean; stats: QueueStats };

/**
 * Logs `queue.stalled` whenever the oldest due job has waited too long, and
 * emails OPS_ALERT_EMAIL about it at most once an hour across every worker
 * and cron tick. Without OPS_ALERT_EMAIL only the log line is written. Pass
 * `stats` when they were just read; throws only when they cannot be.
 */
export async function checkQueueHealth(stats?: QueueStats): Promise<QueueHealth> {
  const current = stats ?? (await getQueueStats());
  if (!isQueueStalled(current)) return { stalled: false, stats: current };

  const alertAfterSeconds = queueAlertAfterSeconds();
  logger.error("queue.stalled", { ...current, alertAfterSeconds });

  const to = optionalEnv("OPS_ALERT_EMAIL");
  if (!to) return { stalled: true, stats: current };

  // Counted in the database, so several workers and cron ticks noticing the same stall send one email between them.
  const gate = await checkRateLimit("ops_alert", "queue_stalled", 1, ALERT_EVERY_MS);
  if (gate.allowed) await sendEmail({ to, ...stalledEmail(current, alertAfterSeconds), tag: "queue-alert" });
  return { stalled: true, stats: current };
}
