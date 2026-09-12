import type { ChannelPlatform } from "@prisma/client";

import type { ContactListFilters, TagMatchMode } from "@/lib/services/contacts";
import type { SegmentFilters } from "@/lib/services/segments";

/**
 * Filter state as the list view holds it, plus conversions to the query
 * string (URL bar, export link, GET /api/contacts), the service shape and the
 * saved-segment shape. Pure helpers — imported by both the server page and
 * client components, so nothing here may touch Prisma.
 */
export type ContactFilterState = {
  q: string;
  channelId: string;
  platform: ChannelPlatform | "";
  tags: string[];
  tagMode: TagMatchMode;
  excludeTags: string[];
  follower: "all" | "yes" | "no";
  /** Days since the last interaction; null = any time. */
  lastInteractionDays: number | null;
  excludeOptedOut: boolean;
};

export const EMPTY_FILTERS: ContactFilterState = {
  q: "",
  channelId: "",
  platform: "",
  tags: [],
  tagMode: "all",
  excludeTags: [],
  follower: "all",
  lastInteractionDays: null,
  excludeOptedOut: false,
};

/** Options offered by the "Last interaction" select; other values (from a segment saved via the API) are shown as-is. */
export const LAST_INTERACTION_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 1, label: "Last 24 hours" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

const MAX_LAST_INTERACTION_DAYS = 365;
const MAX_FILTER_TAGS = 20;

function isPlatform(value: string): value is ChannelPlatform {
  return value === "INSTAGRAM" || value === "FACEBOOK";
}

function uniqTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, MAX_FILTER_TAGS);
}

function parseTagList(value: string): string[] {
  return uniqTags(value.split(","));
}

function parseDays(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LAST_INTERACTION_DAYS ? n : null;
}

export function hasActiveFilters(f: ContactFilterState): boolean {
  return Boolean(
    f.q.trim() || f.channelId || f.platform || f.tags.length || f.excludeTags.length || f.follower !== "all" || f.lastInteractionDays || f.excludeOptedOut,
  );
}

export function filtersToSearchParams(f: ContactFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.channelId) params.set("channelId", f.channelId);
  if (f.platform) params.set("platform", f.platform);
  if (f.tags.length) {
    params.set("tags", f.tags.join(","));
    if (f.tagMode !== "all") params.set("tagMode", f.tagMode);
  }
  if (f.excludeTags.length) params.set("excludeTags", f.excludeTags.join(","));
  if (f.follower !== "all") params.set("follower", f.follower === "yes" ? "true" : "false");
  if (f.lastInteractionDays) params.set("lastInteractionDays", String(f.lastInteractionDays));
  if (f.excludeOptedOut) params.set("excludeOptedOut", "true");
  return params;
}

export function filtersFromSearchParams(params: URLSearchParams | Record<string, string | string[] | undefined>): ContactFilterState {
  const get = (key: string): string => {
    if (params instanceof URLSearchParams) return params.get(key) ?? "";
    const v = params[key];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };
  const follower = get("follower");
  const tagMode = get("tagMode");
  const platform = get("platform");
  const excludeOptedOut = get("excludeOptedOut");
  return {
    q: get("q").slice(0, 120),
    channelId: get("channelId"),
    platform: isPlatform(platform) ? platform : "",
    tags: parseTagList(get("tags")),
    tagMode: tagMode === "any" ? "any" : "all",
    excludeTags: parseTagList(get("excludeTags")),
    follower: follower === "true" || follower === "1" ? "yes" : follower === "false" || follower === "0" ? "no" : "all",
    lastInteractionDays: parseDays(get("lastInteractionDays")),
    excludeOptedOut: excludeOptedOut === "true" || excludeOptedOut === "1",
  };
}

export function filtersToServiceFilters(f: ContactFilterState): ContactListFilters {
  return {
    q: f.q.trim() || undefined,
    channelId: f.channelId || undefined,
    platform: f.platform || undefined,
    tags: f.tags.length ? f.tags : undefined,
    tagMode: f.tagMode,
    excludeTags: f.excludeTags.length ? f.excludeTags : undefined,
    follower: f.follower === "all" ? undefined : f.follower === "yes",
    lastInteractionDays: f.lastInteractionDays ?? undefined,
    excludeOptedOut: f.excludeOptedOut || undefined,
  };
}

// ───────────────────────── Segments ─────────────────────────

/**
 * Canonical segment filters for the current toolbar state — the exact object
 * POST /api/segments stores. Only keys that change the predicate are emitted
 * (mirrors `compactSegmentFilters` on the server) so equality is by meaning.
 */
export function stateToSegmentFilters(f: ContactFilterState): SegmentFilters {
  const out: SegmentFilters = {};
  const q = f.q.trim();
  if (q) out.q = q;
  if (f.channelId) out.channelId = f.channelId;
  if (f.platform) out.platform = f.platform;
  const tags = uniqTags(f.tags);
  if (tags.length) {
    out.tags = tags;
    if (f.tagMode === "any") out.tagMode = "any";
  }
  const excludeTags = uniqTags(f.excludeTags);
  if (excludeTags.length) out.excludeTags = excludeTags;
  if (f.follower === "yes") out.onlyFollowers = true;
  else if (f.follower === "no") out.excludeFollowers = true;
  if (f.lastInteractionDays) out.lastInteractionDays = f.lastInteractionDays;
  if (f.excludeOptedOut) out.excludeOptedOut = true;
  return out;
}

/** Stored segment filters → toolbar state. `optedOut: false` (raw API form) reads as the exclude toggle. */
export function segmentFiltersToState(s: SegmentFilters): ContactFilterState {
  return {
    q: s.q?.trim() ?? "",
    channelId: s.channelId ?? "",
    platform: s.platform ?? "",
    tags: uniqTags(s.tags ?? []),
    tagMode: s.tagMode === "any" ? "any" : "all",
    excludeTags: uniqTags(s.excludeTags ?? []),
    follower: s.onlyFollowers ? "yes" : s.excludeFollowers ? "no" : "all",
    lastInteractionDays: s.lastInteractionDays && s.lastInteractionDays >= 1 ? Math.min(s.lastInteractionDays, MAX_LAST_INTERACTION_DAYS) : null,
    excludeOptedOut: Boolean(s.excludeOptedOut) || s.optedOut === false,
  };
}

function canonicalKey(f: ContactFilterState): string {
  const s = stateToSegmentFilters(f);
  // Tag order is presentation only; sort so "a,b" and "b,a" compare equal.
  const sorted: SegmentFilters = { ...s, tags: s.tags ? [...s.tags].sort() : undefined, excludeTags: s.excludeTags ? [...s.excludeTags].sort() : undefined };
  return JSON.stringify(
    Object.keys(sorted)
      .sort()
      .filter((k) => sorted[k as keyof SegmentFilters] !== undefined)
      .map((k) => [k, sorted[k as keyof SegmentFilters]]),
  );
}

/** True when two toolbar states would produce the same predicate. */
export function filtersEqual(a: ContactFilterState, b: ContactFilterState): boolean {
  return canonicalKey(a) === canonicalKey(b);
}

/** Short human summary for tooltips and the rail, e.g. "Tags: vip · followers · last 7 days". */
export function describeSegmentFilters(s: SegmentFilters): string {
  const parts: string[] = [];
  if (s.q) parts.push(`“${s.q}”`);
  if (s.platform) parts.push(s.platform === "INSTAGRAM" ? "Instagram" : "Facebook");
  if (s.channelId) parts.push("one channel");
  if (s.tags?.length) parts.push(`${s.tagMode === "any" ? "any of" : "tags"} ${s.tags.join(", ")}`);
  if (s.excludeTags?.length) parts.push(`not ${s.excludeTags.join(", ")}`);
  if (s.onlyFollowers) parts.push("followers");
  else if (s.excludeFollowers) parts.push("not following");
  if (s.lastInteractionDays) parts.push(s.lastInteractionDays === 1 ? "last 24 hours" : `last ${s.lastInteractionDays} days`);
  if (s.excludeOptedOut || s.optedOut === false) parts.push("excl. opted out");
  else if (s.optedOut === true) parts.push("opted out only");
  return parts.length ? parts.join(" · ") : "All contacts";
}
