/** Date helpers shared by the analytics pages. Pure, so server pages can use them. */

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's YYYY-MM-DD in the given IANA time zone (UTC if the zone is unknown). */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** The YYYY-MM-DD `days` before `key`. */
export function minusDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** "37%" or "4.2%" below ten percent; a dash when there's nothing to divide. */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}
