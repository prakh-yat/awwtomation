import { differenceInCalendarDays, format, isSameDay, isThisYear, isToday, isYesterday } from "date-fns";

import type { InboxContact, InboxUser } from "@/lib/services/inbox";

/** "now", "5m", "3h", "2d", then "Mar 4" / "Mar 4, 2025" — the compact style used in the thread list. */
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

/** "23h left", "45m left", "6d left" — what remains of a messaging window. */
export function timeLeft(expiresAtIso: string | null, now = Date.now()): string {
  if (!expiresAtIso) return "";
  const ms = new Date(expiresAtIso).getTime() - now;
  if (ms <= 0) return "expired";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
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

export function formatTime(iso: string): string {
  return format(new Date(iso), "h:mm a");
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy 'at' h:mm a");
}

export function contactDisplayName(contact: Pick<InboxContact, "name" | "username" | "externalId">): string {
  return contact.name?.trim() || (contact.username ? `@${contact.username.replace(/^@/, "")}` : `User ${contact.externalId.slice(-6)}`);
}

export function contactHandle(contact: Pick<InboxContact, "username">): string | null {
  return contact.username ? `@${contact.username.replace(/^@/, "")}` : null;
}

export function userDisplayName(user: Pick<InboxUser, "name" | "email">): string {
  return user.name?.trim() || user.email;
}
