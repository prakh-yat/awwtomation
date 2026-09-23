import { differenceInCalendarDays, format, isSameDay, isThisYear, isToday, isYesterday } from "date-fns";

import type { InboxContact, InboxUser } from "@/lib/services/inbox";

/** "now", "5m", "3h", "2d", then "Mar 4" / "Mar 4, 2025": the compact style used in the thread list. */
export function shortRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return isThisYear(date) ? format(date, "MMM d") : format(date, "MMM d, yyyy");
}

/** "12m ago", "3d ago", or just the date once it's more than a week old. */
export function relativeAgo(iso: string | null, now = Date.now()): string {
  const short = shortRelative(iso, now);
  if (!short) return "";
  if (short === "now") return "just now";
  return /^\d+[mhd]$/.test(short) ? `${short} ago` : short;
}

/**
 * When something later today, tomorrow or this week happens: "4:12 pm",
 * "tomorrow 4:12 pm", "Fri 4:12 pm", then "Mar 11". Used for the reply window.
 */
export function untilLabel(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const days = differenceInCalendarDays(date, new Date(now));
  const time = format(date, "h:mm aaa");
  if (days <= 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  if (days < 7) return `${format(date, "EEE")} ${time}`;
  return format(date, "MMM d");
}

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), date) < 7) return format(date, "EEEE");
  return isThisYear(date) ? format(date, "EEEE, MMM d") : format(date, "MMM d, yyyy");
}

export function sameDay(aIso: string, bIso: string): boolean {
  return isSameDay(new Date(aIso), new Date(bIso));
}

/** "4:12 pm" */
export function formatTime(iso: string): string {
  return format(new Date(iso), "h:mm aaa");
}

/** "Mar 4, 2025, 4:12 pm" */
export function formatDateTime(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy, h:mm aaa");
}

/** Stored previews use a bracketed placeholder when a message has no text. */
const PREVIEW_PLACEHOLDERS = new Map<string, string>([
  ["[image]", "Photo"],
  ["[buttons]", "Link buttons"],
  ["[story reply]", "Replied to your story"],
  ["[attachment]", "Attachment"],
]);

/** A stored conversation preview as it should read in a list. */
export function previewText(preview: string): string {
  return PREVIEW_PLACEHOLDERS.get(preview) ?? preview;
}

/** Real name, else @username. Page-scoped ids mean nothing to a person, so they are never shown. */
export function contactDisplayName(contact: Pick<InboxContact, "name" | "username">): string {
  return contact.name?.trim() || (contact.username ? `@${contact.username.replace(/^@/, "")}` : "Unknown contact");
}

export function contactHandle(contact: Pick<InboxContact, "username">): string | null {
  return contact.username ? `@${contact.username.replace(/^@/, "")}` : null;
}

export function userDisplayName(user: Pick<InboxUser, "name" | "email">): string {
  return user.name?.trim() || user.email;
}
