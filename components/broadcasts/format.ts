import type { BroadcastStatus, DeliveryStatus } from "@prisma/client";

import type { BadgeProps } from "@/components/ui/badge";

import type { SegmentSummary } from "@/lib/services/segments";

import type { BroadcastAudience, BroadcastRow } from "./types";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_META: Record<BroadcastStatus, { label: string; variant: BadgeVariant; live?: boolean }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "sky" },
  SENDING: { label: "Sending", variant: "blue", live: true },
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

export function statusMeta(status: BroadcastStatus): { label: string; variant: BadgeVariant; live?: boolean } {
  return STATUS_META[status];
}

const DELIVERY_META: Record<DeliveryStatus, { label: string; variant: BadgeVariant }> = {
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  SKIPPED_WINDOW: { label: "Over 24 hours", variant: "secondary" },
  SKIPPED_OPTED_OUT: { label: "Opted out", variant: "secondary" },
  SKIPPED_PLAN_LIMIT: { label: "Monthly limit", variant: "yellow" },
  SKIPPED_CONTACT_LIMIT: { label: "Contact limit", variant: "yellow" },
  SKIPPED_RATE_LIMIT: { label: "Too many at once", variant: "yellow" },
  SKIPPED_SELF: { label: "Own account", variant: "secondary" },
  SKIPPED_DUPLICATE: { label: "Already sent", variant: "secondary" },
  SKIPPED_NOT_FOLLOWING: { label: "Not following", variant: "secondary" },
};

export function deliveryMeta(status: DeliveryStatus): { label: string; variant: BadgeVariant } {
  return DELIVERY_META[status];
}

export function channelLabel(channel: { username: string | null; name: string | null }): string {
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? "Unnamed account";
}

/** "Tagged vip, lead · not churned · followers only · last 7 days", or "Everyone on this account". */
export function summarizeAudience(audience: BroadcastAudience): string {
  const parts: string[] = [];
  if (audience.q) parts.push(`“${audience.q}”`);
  if (audience.tags.length) parts.push(`Tagged ${audience.tagMode === "all" && audience.tags.length > 1 ? "all of " : ""}${audience.tags.join(", ")}`);
  if (audience.excludeTags.length) parts.push(`not ${audience.excludeTags.join(", ")}`);
  if (audience.onlyFollowers) parts.push("followers only");
  if (audience.lastInteractionDays) parts.push(audience.lastInteractionDays === 1 ? "last 24 hours" : `last ${audience.lastInteractionDays} days`);
  if (!parts.length) return "Everyone on this account";
  const summary = parts.join(" · ");
  return summary.charAt(0).toUpperCase() + summary.slice(1);
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

/** "Sep 6, 2026, 14:05" in the workspace timezone, the same shape Logs and Contacts use. */
export function formatDateTime(value: string | Date | null | undefined, timeZone: string): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Short zone label, e.g. "GMT+5:45": helps explain the datetime picker. */
export function timeZoneAbbreviation(timeZone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(timeZone), timeZoneName: "short" }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** "Nepal Time (GMT+5:45)", or just the offset when the runtime has no plain name for the zone. */
export function timeZoneLabel(timeZone: string, at = new Date()): string {
  const offset = timeZoneAbbreviation(timeZone, at);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(timeZone), timeZoneName: "long" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return name && !name.startsWith("GMT") ? `${name} (${offset})` : offset;
}
