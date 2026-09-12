/**
 * datetime-local ⇄ UTC conversion in an arbitrary IANA zone without a tz
 * library (date-fns v4 ships none). Workspace times are shown and entered in
 * the workspace's timezone; the DB stores UTC.
 */

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallClock(utcMs: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Some engines print "24" for midnight under h23 on older ICU builds.
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function offsetMs(utcMs: number, timeZone: string): number {
  const w = wallClock(utcMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Date → "YYYY-MM-DDTHH:mm" wall time in `timeZone` (what <input type="datetime-local"> wants). */
export function toDatetimeLocal(date: Date, timeZone: string): string {
  const w = wallClock(date.getTime(), safeTimeZone(timeZone));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** "YYYY-MM-DDTHH:mm" wall time in `timeZone` → UTC Date (null when unparsable). */
export function fromDatetimeLocal(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const tz = safeTimeZone(timeZone);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes converge on the correct offset across DST transitions.
  let utc = guess - offsetMs(guess, tz);
  utc = guess - offsetMs(utc, tz);
  const result = new Date(utc);
  return Number.isNaN(result.getTime()) ? null : result;
}
