import type { JobStatus, JobType, PlanTier } from "@prisma/client";

/**
 * Client-safe enum lists and labels. Type-only imports from @prisma/client
 * are erased at build time, so these never pull Prisma into the browser.
 */

export const JOB_STATUSES: readonly JobStatus[] = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];

export const JOB_TYPES: readonly JobType[] = [
  "EXECUTE_FLOW",
  "PUBLIC_REPLY",
  "BROADCAST_SEND",
  "REFRESH_TOKEN",
  "RECONCILE_COMMENTS",
  "SYNC_MEDIA",
];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  EXECUTE_FLOW: "Execute flow",
  PUBLIC_REPLY: "Public reply",
  BROADCAST_SEND: "Broadcast send",
  REFRESH_TOKEN: "Refresh token",
  RECONCILE_COMMENTS: "Reconcile comments",
  SYNC_MEDIA: "Sync media",
};

export const PLAN_TIERS: readonly PlanTier[] = ["FREE", "STARTER", "PRO", "AGENCY"];

export const PLAN_LABELS: Record<PlanTier, string> = { FREE: "Free", STARTER: "Starter", PRO: "Pro", AGENCY: "Agency" };

/** "SKIPPED_RATE_LIMIT" → "Skipped rate limit". */
export function humanize(value: string): string {
  const words = value.toLowerCase().split("_");
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}
