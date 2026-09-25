import "dotenv/config";
import { hostname } from "node:os";
import type { Job } from "@prisma/client";
import { enqueueReconcileJobs } from "@/lib/automation/reconcile";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueTokenRefreshes } from "@/lib/meta/tokens";
import { claimJobs, getQueueStats, releaseStaleJobs, runJob } from "@/lib/queue";
import { checkQueueHealth } from "@/lib/services/ops-alerts";

/**
 * Long-running queue worker (`npm run worker`). Safe to run several copies:
 * job claiming uses SKIP LOCKED and periodic enqueues use bucketed dedupe keys.
 *
 * Jobs run in a pool of WORKER_BATCH_SIZE slots, and a slot is claimed for
 * again as soon as its job ends, so one slow AI provider call holds up only its
 * own slot, never the DMs queued behind it.
 */
const env = getEnv();
const workerId = `${hostname()}:${process.pid}`;
const concurrency = Math.max(1, Math.floor(env.WORKER_BATCH_SIZE));

const STALE_RELEASE_INTERVAL_MS = 60_000;
/** Queue stats are a few indexed counts; this is often enough for the log line and the stall alert. */
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const TOKEN_REFRESH_INTERVAL_MS = 24 * 3600 * 1000;
const HOUSEKEEPING_INTERVAL_MS = 6 * 3600 * 1000;
/** A first run on a large backlog stops here and continues on the next one. */
const HOUSEKEEPING_BUDGET_MS = 10 * 60_000;
const BROADCAST_DUE_INTERVAL_MS = 60_000;
const SHUTDOWN_GRACE_MS = 30_000;

let stopping = false;
const timers: NodeJS.Timeout[] = [];
/** One promise per job running now; each removes itself when its job ends. */
const inFlight = new Set<Promise<void>>();
/** The claim in progress, if any. */
let filling: Promise<void> | null = null;
/** A job ended while a claim was in progress: its slot is looked at before that claim round ends. */
let refill = false;
/** Outcomes since the last heartbeat. */
let completed = 0;
let failed = 0;
let heartbeats = 0;

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** Runs a claimed job in its slot. When it ends, the slot is free and is claimed for again straight away. */
function start(job: Job): void {
  const task: Promise<void> = runJob(job)
    .then((outcome) => {
      if (outcome === "failed") failed++;
      else completed++;
    })
    .catch((err) => {
      // runJob records a failing job itself; this only sees one that could not even start.
      failed++;
      logger.error("worker.job_error", { workerId, jobId: job.id, error: describe(err) });
    })
    .finally(() => {
      inFlight.delete(task);
      void fill();
    });
  inFlight.add(task);
}

async function claimForFreeSlots(): Promise<void> {
  try {
    do {
      refill = false;
      while (!stopping && inFlight.size < concurrency) {
        const room = concurrency - inFlight.size;
        const jobs = await claimJobs(workerId, room);
        for (const job of jobs) start(job);
        // Fewer than asked for: nothing else is due right now.
        if (jobs.length < room) break;
      }
    } while (refill && !stopping);
  } catch (err) {
    logger.error("worker.claim_error", { workerId, error: describe(err) });
  }
}

/**
 * Claims a job for every free slot and starts each without waiting for the
 * others. Runs on the poll timer and whenever a job ends, but never twice at
 * once, so two calls cannot claim for the same free slot.
 */
function fill(): Promise<void> {
  if (stopping) return Promise.resolve();
  if (filling) {
    refill = true;
    return filling;
  }
  filling = claimForFreeSlots().finally(() => {
    filling = null;
  });
  return filling;
}

async function heartbeat(): Promise<void> {
  const stats = await getQueueStats();
  logger.info("worker.heartbeat", { workerId, ...stats, running: inFlight.size, completed, failed, uptimeSeconds: Math.round(process.uptime()) });
  completed = 0;
  failed = 0;
  // The first one runs at startup, before the pool has had a go at whatever
  // piled up while no worker was running: judge the queue from the next one.
  if (heartbeats++ > 0) await checkQueueHealth(stats);
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info("worker.stopping", { workerId, signal, running: inFlight.size });
  for (const timer of timers) clearInterval(timer);
  // A claim in flight still starts the jobs it gets back, so wait for it before counting what is running.
  const drained = (async () => {
    if (filling) await filling;
    await Promise.allSettled([...inFlight]);
  })();
  await Promise.race([drained, sleep(SHUTDOWN_GRACE_MS)]);
  // Anything still running stays PROCESSING and is handed out again by releaseStaleJobs.
  await prisma.$disconnect().catch(() => undefined);
  logger.info("worker.stopped", { workerId, abandoned: inFlight.size });
  process.exit(0);
}

function main(): void {
  logger.info("worker.started", {
    workerId,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    concurrency,
    commentPollIntervalMs: env.COMMENT_POLL_INTERVAL_MS,
  });

  timers.push(setInterval(() => void fill(), env.WORKER_POLL_INTERVAL_MS));
  void fill();

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
    // Imported lazily for the same load-order reason as broadcasts above.
    const { runHousekeeping } = await import("@/lib/services/retention");
    await runHousekeeping(HOUSEKEEPING_BUDGET_MS);
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
