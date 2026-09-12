/**
 * Date formatting pinned to a fixed locale and the workspace timezone, so the
 * server render and the client hydration produce identical strings.
 */

function safeFormatter(options: Intl.DateTimeFormatOptions, timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
  }
}

/** "Mar 4, 14:05" — compact enough for a table cell. */
export function formatLogTime(iso: string, timeZone: string): string {
  return safeFormatter({ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone).format(new Date(iso));
}

/** "Mar 4, 2026, 14:05:32 GMT+5:45" — for tooltips and the expanded row. */
export function formatLogTimeLong(iso: string, timeZone: string): string {
  return safeFormatter(
    { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" },
    timeZone,
  ).format(new Date(iso));
}

/** "Mar 4, 2026" */
export function formatDate(iso: string, timeZone: string): string {
  return safeFormatter({ year: "numeric", month: "short", day: "numeric" }, timeZone).format(new Date(iso));
}

/** Today's YYYY-MM-DD in the zone — the upper bound for date pickers. */
export function todayKey(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** "@handle" from whichever identifier we have; falls back to the display name or the raw id. */
export function recipientHandle(username: string | null | undefined, name?: string | null, externalId?: string | null): string {
  const clean = username?.trim().replace(/^@/, "");
  if (clean) return `@${clean}`;
  if (name?.trim()) return name.trim();
  return externalId ? `id ${externalId}` : "Unknown recipient";
}
