import { formatDistanceToNowStrict } from "date-fns";

import type { ContactListItem } from "@/lib/services/contacts";

/** Name to show in lists and headers: real name, else @username, else which platform they came from. */
export function contactDisplayName(contact: Pick<ContactListItem, "name" | "username" | "platform">): string {
  const name = contact.name?.trim();
  if (name) return name;
  const username = contact.username?.trim();
  if (username) return `@${username.replace(/^@/, "")}`;
  return contact.platform === "FACEBOOK" ? "Facebook user" : "Instagram user";
}

/**
 * Public profile link. Instagram usernames map to profile URLs; Facebook
 * PSIDs are page-scoped and cannot be resolved to a profile, so FB contacts
 * only get a link when we happen to know a username.
 */
export function contactProfileUrl(contact: Pick<ContactListItem, "platform" | "username">): string | null {
  const username = contact.username?.trim().replace(/^@/, "");
  if (!username) return null;
  return contact.platform === "INSTAGRAM" ? `https://instagram.com/${encodeURIComponent(username)}` : `https://facebook.com/${encodeURIComponent(username)}`;
}

export function platformLabel(platform: "INSTAGRAM" | "FACEBOOK"): string {
  return platform === "INSTAGRAM" ? "Instagram" : "Facebook";
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "3h ago" — for table cells. Pair with `formatAbsolute` in a title attribute. */
export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return formatDistanceToNowStrict(toDate(value), { addSuffix: true });
}

const DATE_TIME: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
const DATE_ONLY: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

/** Absolute time in the workspace timezone, e.g. "Sep 6, 2026, 14:05". */
export function formatAbsolute(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { ...DATE_TIME, timeZone }).format(toDate(value));
  } catch {
    // Unknown IANA zone on this runtime: fall back to UTC rather than crash the page.
    return new Intl.DateTimeFormat("en-US", { ...DATE_TIME, timeZone: "UTC" }).format(toDate(value));
  }
}

/** "Sep 6, 2026" in the workspace timezone. */
export function formatDate(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { ...DATE_ONLY, timeZone }).format(toDate(value));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...DATE_ONLY, timeZone: "UTC" }).format(toDate(value));
  }
}
