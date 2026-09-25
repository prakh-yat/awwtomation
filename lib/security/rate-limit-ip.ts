import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/workspace/api";

/**
 * Request rate limits for public and per-user HTTP endpoints.
 *
 * Counters live in Postgres (`RequestRateLimit`), so every web instance and
 * every serverless invocation shares one budget and a restart resets nothing.
 * Each key keeps a fixed window per period; the estimate weighs in the previous
 * window by how much of it still overlaps, which smooths the burst a plain
 * fixed window allows at its edge.
 *
 * `checkLocalRateLimit` is the old per-process counter. It stays for the one
 * place a database write per request would be the problem rather than the
 * cure: requests whose webhook signature did not verify.
 *
 * Not to be confused with `lib/rate-limit.ts`, which tracks Meta's per-account
 * send quotas.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a retry has a chance of succeeding (>= 1 when blocked). */
  retryAfterSeconds: number;
};

export const ONE_MINUTE_MS = 60_000;
const DAY_MS = 24 * 3600 * 1000;

function estimate(limit: number, windowStart: number, windowMs: number, now: number, current: number, previous: number): RateLimitResult {
  const elapsedFraction = (now - windowStart) / windowMs;
  const estimated = previous * (1 - elapsedFraction) + current;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  if (estimated > limit) return { allowed: false, limit, remaining: 0, retryAfterSeconds };
  return { allowed: true, limit, remaining: Math.max(0, Math.floor(limit - estimated)), retryAfterSeconds };
}

// ───────────────────────── Per-process fallback ─────────────────────────

type Window = { start: number; windowMs: number; count: number; prevCount: number };

/** Survives dev HMR module reloads so limits are not reset on every edit. */
const globalStore = globalThis as unknown as { __awwRateLimitStore?: Map<string, Window>; __awwRateLimitSweep?: number };
const store: Map<string, Window> = globalStore.__awwRateLimitStore ?? new Map();
globalStore.__awwRateLimitStore = store;

const SWEEP_INTERVAL_MS = 60_000;

/** Drop windows nobody has touched for two full periods so the map stays bounded. */
function sweep(now: number): void {
  const last = globalStore.__awwRateLimitSweep ?? 0;
  if (now - last < SWEEP_INTERVAL_MS) return;
  globalStore.__awwRateLimitSweep = now;
  for (const [key, win] of store) {
    if (now - win.start > win.windowMs * 2) store.delete(key);
  }
}

/**
 * Counts in this process only. Used where writing to the database for every
 * request is exactly what an attacker wants, and as the fallback when the
 * database cannot be reached.
 */
export function checkLocalRateLimit(bucket: string, key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const id = `${bucket}:${key}`;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  let win = store.get(id);
  if (!win || win.windowMs !== windowMs) {
    win = { start: windowStart, windowMs, count: 0, prevCount: 0 };
    store.set(id, win);
  } else if (win.start !== windowStart) {
    // Roll the window; the previous count only carries over when it was the adjacent period.
    win.prevCount = win.start === windowStart - windowMs ? win.count : 0;
    win.count = 0;
    win.start = windowStart;
  }
  win.count += 1;
  return estimate(limit, windowStart, windowMs, now, win.count, win.prevCount);
}

// ───────────────────────── Shared (Postgres) ─────────────────────────

/** The columns carry no zone, so a timestamptz parameter would be shifted by the session zone. */
function utc(ms: number): Prisma.Sql {
  return Prisma.sql`${new Date(ms).toISOString()}::timestamp`;
}

/**
 * Counts this request against `bucket:key` and says whether it is within
 * `limit` per `windowMs`. One round trip: the upsert and the previous window's
 * count come back together. A database failure falls back to the per-process
 * counter rather than refusing everyone.
 */
export async function checkRateLimit(bucket: string, key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const id = `${bucket}:${key}`.slice(0, 300);
  try {
    const rows = await prisma.$queryRaw<Array<{ current: number; previous: number }>>(Prisma.sql`
      WITH cur AS (
        INSERT INTO "RequestRateLimit" ("key", "windowStart", "count")
        VALUES (${id}, ${utc(windowStart)}, 1)
        ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RequestRateLimit"."count" + 1
        RETURNING "count"
      )
      SELECT (SELECT "count" FROM cur)::int AS current,
        COALESCE((SELECT "count" FROM "RequestRateLimit" WHERE "key" = ${id} AND "windowStart" = ${utc(windowStart - windowMs)}), 0)::int AS previous
    `);
    const row = rows[0];
    return estimate(limit, windowStart, windowMs, now, Number(row?.current ?? 1), Number(row?.previous ?? 0));
  } catch (err) {
    logger.warn("rate_limit.db_unavailable", { bucket, error: err instanceof Error ? err.message : String(err) });
    return checkLocalRateLimit(bucket, key, limit, windowMs);
  }
}

/** Housekeeping: windows older than `olderThanMs` can no longer affect any estimate. */
export async function pruneRequestRateLimits(olderThanMs = DAY_MS): Promise<number> {
  const res = await prisma.requestRateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } } });
  return res.count;
}

/**
 * Best-effort client address. `x-forwarded-for` is only trustworthy behind a
 * proxy that overwrites it (Vercel, Railway, Cloudflare do); on a bare
 * `next start` a client could spoof it, which merely lets them dodge their
 * own limit: never gain access.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
}

const RATE_LIMITED_MESSAGE = "Too many requests. Please slow down and try again shortly.";

/** 429 JSON in the ARCHITECTURE §3 error shape, for handlers outside `withWorkspace`. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: RATE_LIMITED_MESSAGE, code: "RATE_LIMITED" },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}

/** Returns a 429 response to send, or null when the caller is within budget. */
export async function enforceIpRateLimit(req: Request, bucket: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const result = await checkRateLimit(bucket, clientIp(req), limit, windowMs);
  return result.allowed ? null : rateLimitResponse(result);
}

/** Throws an `ApiError` 429 (rendered by `handleApiError` with Retry-After) when the key is over budget. */
export async function assertRateLimit(bucket: string, key: string, limit: number, windowMs: number): Promise<void> {
  const result = await checkRateLimit(bucket, key, limit, windowMs);
  if (!result.allowed) throw new ApiError(429, RATE_LIMITED_MESSAGE, "RATE_LIMITED", rateLimitHeaders(result));
}
