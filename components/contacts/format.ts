import { formatDistanceToNowStrict } from "date-fns";

import type { ContactListItem } from "@/lib/services/contacts";

/** Name to show in lists and headers: real name, else @username, else a short external id. */
export function contactDisplayName(contact: Pick<ContactListItem, "name" | "username" | "externalId">): string {
  const name = contact.name?.trim();
  if (name) return name;
  const username = contact.username?.trim();
  if (username) return `@${username.replace(/^@/, "")}`;
  return `User ${contact.externalId.slice(-6)}`;
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

/** Absolute time in the workspace timezone, e.g. "6 Sep 2026, 14:05". */
export function formatAbsolute(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(toDate(value));
  } catch {
    // Unknown IANA zone on this runtime — fall back to UTC rather than crash the page.
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(toDate(value));
  }
}

export function formatDate(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium" }).format(toDate(value));
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium" }).format(toDate(value));
  }
}
