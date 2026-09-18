import { JobStatus, JobType, Prisma, type Job } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const STALE_LOCK_MS = 10 * 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const MAX_ERROR_LENGTH = 2000;

export type EnqueueInput = {
  type: JobType;
  payload: Record<string, unknown>;
  workspaceId?: string;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
};

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Returns null when `dedupeKey` already exists (completed jobs keep their key, so a key is a one-shot). */
export async function enqueue(input: EnqueueInput): Promise<Job | null> {
  try {
    return await prisma.job.create({
      data: {
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        workspaceId: input.workspaceId,
        runAt: input.runAt ?? new Date(),
        dedupeKey: input.dedupeKey,
        maxAttempts: input.maxAttempts ?? 5,
      },
    });
  } catch (err) {
    if (input.dedupeKey && isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Claim up to `limit` due jobs with SELECT … FOR UPDATE SKIP LOCKED so many
 * workers (and cron ticks) can poll the same table without double-processing.
 * `attempts` is bumped at claim time so a crash mid-job still counts.
 */
export async function claimJobs(workerId: string, limit: number): Promise<Job[]> {
  if (limit <= 0) return [];
  return prisma.$queryRaw<Job[]>(Prisma.sql`
    WITH picked AS (
      SELECT "id" FROM "Job"
      WHERE "status" = 'PENDING'::"JobStatus" AND "runAt" <= NOW()
      ORDER BY "runAt" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "Job" AS j
    SET "status" = 'PROCESSING'::"JobStatus",
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "attempts" = j."attempts" + 1,
        "updatedAt" = NOW()
    FROM picked
    WHERE j."id" = picked."id"
    RETURNING j.*
  `);
}

export async function completeJob(id: string): Promise<void> {
  await prisma.job.update({
    where: { id },
    data: { status: JobStatus.COMPLETED, lockedAt: null, lockedBy: null, lastError: null },
  });
}

/** Exponential backoff 30s·2^attempts capped at 1h; FAILED once attempts reach maxAttempts. */
export async function failJob(id: string, error: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id }, select: { attempts: true, maxAttempts: true } });
  if (!job) return;
  const lastError = error.slice(0, MAX_ERROR_LENGTH);
  if (job.attempts >= job.maxAttempts) {
    await prisma.job.update({ where: { id }, data: { status: JobStatus.FAILED, lockedAt: null, lockedBy: null, lastError } });
    return;
  }
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** job.attempts, MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * Math.min(delay * 0.1, 5_000));
  await prisma.job.update({
    where: { id },
    data: { status: JobStatus.PENDING, runAt: new Date(Date.now() + delay + jitter), lockedAt: null, lockedBy: null, lastError },
  });
}

/** Jobs whose worker died mid-flight: return them to the queue. */
export async function releaseStaleJobs(olderThanMs = STALE_LOCK_MS): Promise<number> {
  const res = await prisma.job.updateMany({
    where: { status: JobStatus.PROCESSING, lockedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: JobStatus.PENDING, lockedAt: null, lockedBy: null, lastError: "Released stale lock" },
  });
  if (res.count > 0) logger.warn("queue.released_stale", { count: res.count });
  return res.count;
}

export type BatchResult = { processed: number; failed: number; claimed: number };

function errorMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/**
 * Claim → dispatch to `handlers[type]` → complete/fail. Jobs in a batch run
 * concurrently; they are independent by construction (dedupe keys + the
 * engine's atomic session transitions).
 */
export async function processBatch(workerId: string, limit: number): Promise<BatchResult> {
  const jobs = await claimJobs(workerId, limit);
  if (jobs.length === 0) return { processed: 0, failed: 0, claimed: 0 };

  // Lazy import breaks the handlers → engine → queue import cycle at bundle time.
  const { handlers } = await import("./handlers");

  let processed = 0;
  let failed = 0;
  await Promise.all(
    jobs.map(async (job) => {
      const handler = handlers[job.type];
      const startedAt = Date.now();
      try {
        if (!handler) throw new Error(`No handler registered for job type ${job.type}`);
        await handler(job);
        await completeJob(job.id);
        processed++;
        logger.info("queue.job_completed", { jobId: job.id, type: job.type, ms: Date.now() - startedAt, attempts: job.attempts });
      } catch (err) {
        failed++;
        const message = errorMessage(err);
        logger.error("queue.job_failed", { jobId: job.id, type: job.type, attempts: job.attempts, maxAttempts: job.maxAttempts, error: message });
        try {
          await failJob(job.id, message);
        } catch (failErr) {
          logger.error("queue.fail_job_error", { jobId: job.id, error: errorMessage(failErr) });
        }
      }
    }),
  );
  return { processed, failed, claimed: jobs.length };
}

export type QueueStats = Record<JobStatus, number> & { due: number };

/** Counts by status plus how many PENDING jobs are due now: for the worker heartbeat and admin health. */
export async function getQueueStats(): Promise<QueueStats> {
  const [grouped, due] = await Promise.all([
    prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.job.count({ where: { status: JobStatus.PENDING, runAt: { lte: new Date() } } }),
  ]);
  const stats: QueueStats = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0, CANCELLED: 0, due };
  for (const row of grouped) stats[row.status] = row._count._all;
  return stats;
}

/** Admin: put a FAILED/CANCELLED job back in the queue with a fresh attempt budget. */
export async function retryJob(id: string): Promise<Job | null> {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job || (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED)) return null;
  return prisma.job.update({
    where: { id },
    data: { status: JobStatus.PENDING, attempts: 0, runAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
  });
}

export async function cancelJob(id: string): Promise<boolean> {
  const res = await prisma.job.updateMany({
    where: { id, status: { in: [JobStatus.PENDING, JobStatus.FAILED] } },
    data: { status: JobStatus.CANCELLED, lockedAt: null, lockedBy: null },
  });
  return res.count > 0;
}

/** Housekeeping: drop COMPLETED jobs older than `olderThanMs` so the table (and its dedupe index) stays small. */
export async function pruneCompletedJobs(olderThanMs = 7 * 24 * 3600 * 1000): Promise<number> {
  const res = await prisma.job.deleteMany({
    where: { status: JobStatus.COMPLETED, updatedAt: { lt: new Date(Date.now() - olderThanMs) } },
  });
  return res.count;
}

export { JobType };
