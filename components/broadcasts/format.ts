import type { BroadcastStatus, DeliveryStatus } from "@prisma/client";

import type { BadgeProps } from "@/components/ui/badge";

import type { SegmentSummary } from "@/lib/services/segments";

import type { BroadcastAudience, BroadcastRow } from "./types";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_META: Record<BroadcastStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  SENDING: { label: "Sending", variant: "warning" },
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

export function statusMeta(status: BroadcastStatus): { label: string; variant: BadgeVariant } {
  return STATUS_META[status];
}

const DELIVERY_META: Record<DeliveryStatus, { label: string; variant: BadgeVariant }> = {
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  SKIPPED_WINDOW: { label: "Outside 24h window", variant: "outline" },
  SKIPPED_OPTED_OUT: { label: "Opted out", variant: "outline" },
  SKIPPED_PLAN_LIMIT: { label: "Plan limit", variant: "warning" },
  SKIPPED_RATE_LIMIT: { label: "Rate limited", variant: "warning" },
  SKIPPED_SELF: { label: "Own account", variant: "outline" },
  SKIPPED_DUPLICATE: { label: "Duplicate", variant: "outline" },
  SKIPPED_NOT_FOLLOWING: { label: "Not following", variant: "outline" },
};

export function deliveryMeta(status: DeliveryStatus): { label: string; variant: BadgeVariant } {
  return DELIVERY_META[status];
}

export function channelLabel(channel: { username: string | null; name: string | null }): string {
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? "Unnamed channel";
}

/** "Tagged vip, lead · not churned · followers only · last 7 days" — or "Everyone on the channel". */
export function summarizeAudience(audience: BroadcastAudience): string {
  const parts: string[] = [];
  if (audience.q) parts.push(`“${audience.q}”`);
  if (audience.tags.length) parts.push(`Tagged ${audience.tagMode === "all" && audience.tags.length > 1 ? "all of " : ""}${audience.tags.join(", ")}`);
  if (audience.excludeTags.length) parts.push(`not ${audience.excludeTags.join(", ")}`);
  if (audience.onlyFollowers) parts.push("followers only");
  if (audience.lastInteractionDays) parts.push(audience.lastInteractionDays === 1 ? "last 24 hours" : `last ${audience.lastInteractionDays} days`);
  return parts.length ? parts.join(" · ") : "Everyone on the channel";
}

/** "Segment: Warm leads" when the audience came from a saved segment that still exists, else the filter summary. */
export function audienceLabel(row: Pick<BroadcastRow, "audience" | "segmentName">): string {
  return row.segmentName ? `Segment: ${row.segmentName}` : summarizeAudience(row.audience);
}

/**
 * Saved segment → editor audience. Mirrors `segmentFiltersToAudience` in
 * lib/services/broadcasts (which the browser bundle can't import): channel
 * and platform stay with the broadcast, `excludeFollowers` has no equivalent.
 */
export function audienceFromSegment(segment: Pick<SegmentSummary, "id" | "filters">): BroadcastAudience {
  const f = segment.filters;
  return {
    tags: f.tags ?? [],
    tagMode: f.tagMode ?? "all",
    excludeTags: f.excludeTags ?? [],
    onlyFollowers: Boolean(f.onlyFollowers),
    lastInteractionDays: f.lastInteractionDays ?? null,
    q: f.q ?? "",
    segmentId: segment.id,
    onlyInWindow: true,
  };
}

export type ProgressParts = { sent: number; other: number; processed: number; target: number; fraction: number };

/** Share of the target that has an outcome; `sent` vs `other` (failed + skipped) for the two-tone bar. */
export function progressParts(row: Pick<BroadcastRow, "targetCount" | "sentCount" | "failedCount" | "skippedCount" | "status">): ProgressParts {
  const target = row.targetCount;
  const processed = row.sentCount + row.failedCount + row.skippedCount;
  const fraction = target > 0 ? Math.min(1, processed / target) : row.status === "SENT" ? 1 : 0;
  return { sent: row.sentCount, other: row.failedCount + row.skippedCount, processed, target, fraction };
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en").format(n);
}

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** "6 Sep 2026, 14:05" in the workspace timezone. */
export function formatDateTime(value: string | Date | null | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTimeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Short IANA zone label, e.g. "GMT+5:45" — helps explain the datetime picker. */
export function timeZoneAbbreviation(timeZone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(timeZone), timeZoneName: "short" }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
