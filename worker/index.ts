import "dotenv/config";
import { hostname } from "node:os";
import { enqueueReconcileJobs } from "@/lib/automation/reconcile";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueTokenRefreshes } from "@/lib/meta/tokens";
import { getQueueStats, processBatch, pruneCompletedJobs, releaseStaleJobs } from "@/lib/queue";
import { pruneRateLimitWindows } from "@/lib/rate-limit";

/**
 * Long-running queue worker (`npm run worker`). Safe to run several copies:
 * job claiming uses SKIP LOCKED and periodic enqueues use bucketed dedupe keys.
 */
const env = getEnv();
const workerId = `${hostname()}:${process.pid}`;

const STALE_RELEASE_INTERVAL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const TOKEN_REFRESH_INTERVAL_MS = 24 * 3600 * 1000;
const HOUSEKEEPING_INTERVAL_MS = 6 * 3600 * 1000;
const BROADCAST_DUE_INTERVAL_MS = 60_000;
const SHUTDOWN_GRACE_MS = 30_000;

let stopping = false;
let polling = false;
let inFlight: Promise<unknown> | null = null;
const timers: NodeJS.Timeout[] = [];

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/** Run `fn` on an interval, never overlapping itself and never throwing out of the timer. */
function schedule(name: string, intervalMs: number, fn: () => Promise<void>, opts: { immediate?: boolean } = {}): void {
  let running = false;
  const run = async () => {
    if (stopping || running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      logger.error("worker.task_error", { task: name, error: describe(err) });
    } finally {
      running = false;
    }
  };
  if (opts.immediate) void run();
  timers.push(setInterval(() => void run(), intervalMs));
}

/** Drain the queue: keep claiming while batches come back full. */
async function poll(): Promise<void> {
  if (stopping || polling) return;
  polling = true;
  const work = (async () => {
    for (let i = 0; i < 20 && !stopping; i++) {
      const result = await processBatch(workerId, env.WORKER_BATCH_SIZE);
      if (result.claimed > 0) logger.info("worker.batch", { workerId, ...result });
      if (result.claimed < env.WORKER_BATCH_SIZE) break;
    }
  })();
  inFlight = work;
  try {
    await work;
  } catch (err) {
    logger.error("worker.poll_error", { error: describe(err) });
  } finally {
    inFlight = null;
    polling = false;
  }
}

async function heartbeat(): Promise<void> {
  const stats = await getQueueStats();
  logger.info("worker.heartbeat", {
    workerId,
    pending: stats.PENDING,
    due: stats.due,
    processing: stats.PROCESSING,
    failed: stats.FAILED,
    uptimeSeconds: Math.round(process.uptime()),
  });
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info("worker.stopping", { workerId, signal });
  for (const timer of timers) clearInterval(timer);
  if (inFlight) {
    await Promise.race([inFlight, new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS))]);
  }
  await prisma.$disconnect().catch(() => undefined);
  logger.info("worker.stopped", { workerId });
  process.exit(0);
}

function main(): void {
  logger.info("worker.started", {
    workerId,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    batchSize: env.WORKER_BATCH_SIZE,
    commentPollIntervalMs: env.COMMENT_POLL_INTERVAL_MS,
  });

  timers.push(setInterval(() => void poll(), env.WORKER_POLL_INTERVAL_MS));
  void poll();

  schedule("release_stale", STALE_RELEASE_INTERVAL_MS, async () => {
    await releaseStaleJobs();
  }, { immediate: true });

  schedule("heartbeat", HEARTBEAT_INTERVAL_MS, heartbeat, { immediate: true });

  schedule("reconcile", env.COMMENT_POLL_INTERVAL_MS, async () => {
    const enqueued = await enqueueReconcileJobs(env.COMMENT_POLL_INTERVAL_MS);
    if (enqueued > 0) logger.info("worker.reconcile_enqueued", { enqueued });
  }, { immediate: true });

  schedule("refresh_tokens", TOKEN_REFRESH_INTERVAL_MS, async () => {
    const enqueued = await enqueueTokenRefreshes();
    if (enqueued > 0) logger.info("worker.token_refresh_enqueued", { enqueued });
  }, { immediate: true });

  schedule("broadcasts_due", BROADCAST_DUE_INTERVAL_MS, async () => {
    // Imported lazily: broadcasts → queue → handlers → broadcasts would otherwise form a load-time cycle.
    const { processDueBroadcasts } = await import("@/lib/services/broadcasts");
    await processDueBroadcasts();
  }, { immediate: true });

  schedule("housekeeping", HOUSEKEEPING_INTERVAL_MS, async () => {
    const [jobs, windows] = await Promise.all([pruneCompletedJobs(), pruneRateLimitWindows()]);
    logger.info("worker.housekeeping", { prunedJobs: jobs, prunedRateWindows: windows });
  });

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => logger.error("worker.unhandled_rejection", { error: describe(reason) }));
  process.on("uncaughtException", (err) => {
    logger.error("worker.uncaught_exception", { error: describe(err) });
    void shutdown("uncaughtException");
  });
}

main();
