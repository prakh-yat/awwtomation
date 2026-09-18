/**
 * Formatting pinned to a fixed locale and the workspace timezone so server
 * render and client hydration agree byte for byte.
 */

function safeFormatter(options: Intl.DateTimeFormatOptions, timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
  }
}

/** "Mar 4, 2026" */
export function formatDate(iso: string, timeZone: string): string {
  return safeFormatter({ year: "numeric", month: "short", day: "numeric" }, timeZone).format(new Date(iso));
}

/** "Mar 4, 14:05" */
export function formatDateTime(iso: string, timeZone: string): string {
  return safeFormatter({ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone).format(new Date(iso));
}

/** "Mar 4": for sparkline axis labels and tooltips, from a YYYY-MM-DD key. */
export function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Destination as people read it: host plus a shortened path, no scheme or query noise. */
export function displayDestination(url: string, maxPath = 28): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const shortPath = path.length > maxPath ? `${path.slice(0, maxPath - 1)}…` : path;
    return `${parsed.hostname.replace(/^www\./, "")}${shortPath}${parsed.search ? "?…" : ""}`;
  } catch {
    return url;
  }
}

/** Where the tap most likely came from, judged from the user agent: good enough for a glance, never for billing. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/instagram/i.test(userAgent)) return "Instagram app";
  if (/FBAN|FBAV|FB_IAB/i.test(userAgent)) return "Facebook app";
  if (/messenger/i.test(userAgent)) return "Messenger";
  if (/iphone|ipad/i.test(userAgent)) return "iOS browser";
  if (/android/i.test(userAgent)) return "Android browser";
  return "Browser";
}
