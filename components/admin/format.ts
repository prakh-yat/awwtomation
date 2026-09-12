import { formatDistanceToNowStrict } from "date-fns";

/**
 * Admin views render in UTC on purpose: the DB stores UTC, the worker logs
 * UTC, and a fixed zone avoids server/client hydration mismatches that
 * local-time formatting would cause.
 */

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = new Date(iso).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
}

export function formatUtcDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

/** "2026-09-06" → "Sep 6" for chart axes. */
export function shortDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function truncateText(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Builds an href, dropping empty/undefined params so URLs stay clean. */
export function hrefWith(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}
