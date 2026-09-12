/**
 * Curated IANA zones for the workspace timezone picker. Asia/Kathmandu leads
 * because it is the schema default and the primary market; the rest cover
 * the regions creators and agencies most often operate from. Anything else
 * still round-trips: `withCurrentZone` appends a zone that isn't listed so
 * the Select never shows an empty value for an existing workspace.
 */
export type TimezoneGroup = { region: string; zones: string[] };

export const TIMEZONE_GROUPS: readonly TimezoneGroup[] = [
  {
    region: "Asia",
    zones: [
      "Asia/Kathmandu",
      "Asia/Kolkata",
      "Asia/Dhaka",
      "Asia/Karachi",
      "Asia/Colombo",
      "Asia/Dubai",
      "Asia/Riyadh",
      "Asia/Bangkok",
      "Asia/Jakarta",
      "Asia/Singapore",
      "Asia/Kuala_Lumpur",
      "Asia/Manila",
      "Asia/Hong_Kong",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Asia/Seoul",
    ],
  },
  {
    region: "Australia & Pacific",
    zones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Pacific/Auckland"],
  },
  {
    region: "Europe",
    zones: [
      "Europe/London",
      "Europe/Dublin",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Amsterdam",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Stockholm",
      "Europe/Warsaw",
      "Europe/Istanbul",
      "Europe/Moscow",
    ],
  },
  {
    region: "Americas",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Toronto",
      "America/Vancouver",
      "America/Mexico_City",
      "America/Bogota",
      "America/Sao_Paulo",
      "America/Argentina/Buenos_Aires",
    ],
  },
  {
    region: "Africa & Middle East",
    zones: ["Africa/Cairo", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg", "Asia/Jerusalem"],
  },
  { region: "Other", zones: ["UTC"] },
];

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function timezoneCity(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

/**
 * Current UTC offset like "GMT+5:45". DST-aware because it is computed for
 * `at`, so the label a user sees matches what their clock says today.
 */
export function timezoneOffset(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return name === "GMT" ? "GMT+0" : name;
  } catch {
    return "";
  }
}

export function withCurrentZone(groups: readonly TimezoneGroup[], current: string): TimezoneGroup[] {
  const known = groups.some((g) => g.zones.includes(current));
  if (known || !current) return [...groups];
  return [...groups, { region: "Current", zones: [current] }];
}
