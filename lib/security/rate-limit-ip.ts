import { NextResponse } from "next/server";

import { ApiError } from "@/lib/workspace/api";

/**
 * In-memory request rate limiter for public and per-user HTTP endpoints.
 *
 * Sliding-window counter (current window + weighted previous window), keyed
 * by `${bucket}:${key}` where key is a client IP or a user id. State lives in
 * process memory, so limits are **per instance**: on a single web instance
 * they are exact, on N instances an attacker gets roughly N× the budget.
 * Good enough for launch; swap `store` for Redis/Upstash when scaling out.
 * Not to be confused with `lib/rate-limit.ts`, which tracks Meta's per-account
 * send quotas in Postgres.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a retry has a chance of succeeding (>= 1 when blocked). */
  retryAfterSeconds: number;
};

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

export function checkRateLimit(bucket: string, key: string, limit: number, windowMs: number): RateLimitResult {
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

  const elapsedFraction = (now - windowStart) / windowMs;
  const estimated = win.prevCount * (1 - elapsedFraction) + win.count;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

  if (estimated + 1 > limit) {
    return { allowed: false, limit, remaining: 0, retryAfterSeconds };
  }
  win.count += 1;
  return { allowed: true, limit, remaining: Math.max(0, Math.floor(limit - estimated - 1)), retryAfterSeconds };
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
export function enforceIpRateLimit(req: Request, bucket: string, limit: number, windowMs: number): NextResponse | null {
  const result = checkRateLimit(bucket, clientIp(req), limit, windowMs);
  return result.allowed ? null : rateLimitResponse(result);
}

/** Throws an `ApiError` 429 (rendered by `handleApiError` with Retry-After) when the key is over budget. */
export function assertRateLimit(bucket: string, key: string, limit: number, windowMs: number): void {
  const result = checkRateLimit(bucket, key, limit, windowMs);
  if (!result.allowed) throw new ApiError(429, RATE_LIMITED_MESSAGE, "RATE_LIMITED", rateLimitHeaders(result));
}

export const ONE_MINUTE_MS = 60_000;
