import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Meta: 750 private replies per hour per account. */
export const PRIVATE_REPLY_LIMIT_PER_HOUR = 750;
/** Conservative send-API ceiling; Meta's real limit is higher but bursty sends trip code 4/32. */
export const SEND_LIMIT_PER_MINUTE = 600;

export const HOUR_SECONDS = 3600;
export const MINUTE_SECONDS = 60;

export type RateLimitBucket = "private_reply" | "send" | "public_reply";

export type RateLimitResult = { allowed: boolean; count: number; remaining: number; resetAt: Date };

function windowStartFor(windowSeconds: number, now: number): Date {
  const size = windowSeconds * 1000;
  return new Date(Math.floor(now / size) * size);
}

/**
 * Atomically reserve one slot in the current fixed window. A single
 * INSERT … ON CONFLICT DO UPDATE … WHERE count < limit means concurrent
 * workers can never overshoot; when the conditional update doesn't fire we
 * read the counter back to report the real count.
 */
export async function reserveSlot(
  channelId: string,
  bucket: RateLimitBucket,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = windowStartFor(windowSeconds, now);
  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000);

  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    INSERT INTO "RateLimitWindow" ("id", "channelId", "bucket", "windowStart", "count")
    VALUES (${randomUUID()}, ${channelId}, ${bucket}, ${windowStart}, 1)
    ON CONFLICT ("channelId", "bucket", "windowStart")
    DO UPDATE SET "count" = "RateLimitWindow"."count" + 1
    WHERE "RateLimitWindow"."count" < ${limit}
    RETURNING "count"
  `);

  if (rows.length > 0) {
    const count = Number(rows[0].count);
    return { allowed: count <= limit, count, remaining: Math.max(0, limit - count), resetAt };
  }

  const existing = await prisma.rateLimitWindow.findUnique({
    where: { channelId_bucket_windowStart: { channelId, bucket, windowStart } },
    select: { count: true },
  });
  const count = existing?.count ?? limit;
  return { allowed: false, count, remaining: Math.max(0, limit - count), resetAt };
}

/** Read-only view for dashboards / admin health. */
export async function getRateLimitStatus(channelId: string, bucket: RateLimitBucket, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = windowStartFor(windowSeconds, now);
  const existing = await prisma.rateLimitWindow.findUnique({
    where: { channelId_bucket_windowStart: { channelId, bucket, windowStart } },
    select: { count: true },
  });
  const count = existing?.count ?? 0;
  return { allowed: count < limit, count, remaining: Math.max(0, limit - count), resetAt: new Date(windowStart.getTime() + windowSeconds * 1000) };
}

/** Windows older than a day are dead weight; call from the worker occasionally. */
export async function pruneRateLimitWindows(olderThanMs = 24 * 3600 * 1000): Promise<number> {
  const res = await prisma.rateLimitWindow.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } } });
  return res.count;
}
