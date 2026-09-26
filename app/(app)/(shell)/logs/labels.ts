import type { DeliveryKind, DeliveryStatus } from "@prisma/client";

/** Display order for chips and the help popover: outcomes first, then skips in the order the sender checks them. */
export const STATUS_ORDER: readonly DeliveryStatus[] = [
  "SENT",
  "FAILED",
  "SKIPPED_DUPLICATE",
  "SKIPPED_RATE_LIMIT",
  "SKIPPED_SELF",
  "SKIPPED_NOT_FOLLOWING",
  "SKIPPED_WINDOW",
  "SKIPPED_PLAN_LIMIT",
  "SKIPPED_CONTACT_LIMIT",
  "SKIPPED_OPTED_OUT",
];

export const KIND_ORDER: readonly DeliveryKind[] = ["PRIVATE_REPLY", "MESSAGE", "PUBLIC_REPLY", "BROADCAST"];

/** Short form for chips and the badge in the table. */
export const STATUS_SHORT_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_DUPLICATE: "Already sent",
  SKIPPED_RATE_LIMIT: "Too many at once",
  SKIPPED_SELF: "Own account",
  SKIPPED_NOT_FOLLOWING: "Not following",
  SKIPPED_WINDOW: "Over 24 hours",
  SKIPPED_PLAN_LIMIT: "Monthly limit",
  SKIPPED_CONTACT_LIMIT: "Contact limit",
  SKIPPED_OPTED_OUT: "Opted out",
};

/** Long form, for the badge's tooltip: says plainly that a skip means nothing went out. */
export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_DUPLICATE: "Not sent: already replied",
  SKIPPED_RATE_LIMIT: "Not sent: too many at once",
  SKIPPED_SELF: "Not sent: own account",
  SKIPPED_NOT_FOLLOWING: "Not sent: not following",
  SKIPPED_WINDOW: "Not sent: over 24 hours since their last message",
  SKIPPED_PLAN_LIMIT: "Not sent: monthly limit reached",
  SKIPPED_CONTACT_LIMIT: "Not sent: contact limit reached",
  SKIPPED_OPTED_OUT: "Not sent: opted out",
};

/** What happened, in a line or two. Used by the help popover and an opened row. */
export const STATUS_HELP: Record<DeliveryStatus, string> = {
  SENT: "The message went out.",
  FAILED: "Instagram or Messenger refused it. Open the row to see why.",
  SKIPPED_DUPLICATE: "This comment, or this person, already got a reply.",
  SKIPPED_RATE_LIMIT: "Instagram limits how many DMs go out each hour. This one was over.",
  SKIPPED_SELF: "It came from your own account.",
  SKIPPED_NOT_FOLLOWING: "They weren't following yet, so they got the follow prompt instead.",
  SKIPPED_WINDOW: "You can only message someone within 24 hours of their last message.",
  SKIPPED_PLAN_LIMIT: "You've used this month's DMs. Upgrade to keep sending.",
  SKIPPED_CONTACT_LIMIT: "This person arrived after your plan's contact limit. They're saved, but automations wait until you upgrade.",
  SKIPPED_OPTED_OUT: "They asked not to get messages.",
};

/** Same words as the automation report and contact timeline: a DM is a DM, wherever it started. */
export const KIND_LABELS: Record<DeliveryKind, string> = {
  PRIVATE_REPLY: "DM from comment",
  MESSAGE: "DM",
  PUBLIC_REPLY: "Comment reply",
  BROADCAST: "Broadcast",
};

export type StatusBadgeVariant = "success" | "destructive" | "secondary" | "yellow";

/** Green went out, red was refused, yellow needs you (an upgrade), grey was held back on purpose. */
export function statusVariant(status: DeliveryStatus): StatusBadgeVariant {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "destructive";
  if (status === "SKIPPED_PLAN_LIMIT" || status === "SKIPPED_CONTACT_LIMIT") return "yellow";
  return "secondary";
}

export function isSkipStatus(status: DeliveryStatus): boolean {
  return status !== "SENT" && status !== "FAILED";
}

/** A failure's reason arrives as a short phrase; the few that have a skip twin use the skip's words. */
const FAILURE_WORDING: Record<string, string> = {
  "Outside messaging window": STATUS_SHORT_LABELS.SKIPPED_WINDOW,
  "Sending limit reached": STATUS_SHORT_LABELS.SKIPPED_RATE_LIMIT,
  "Plan limit reached": STATUS_SHORT_LABELS.SKIPPED_PLAN_LIMIT,
};

/** The line under a Failed badge, or null when it would only repeat "Failed". */
export function failureReason(reason: string | null): string | null {
  if (!reason || reason === "Failed") return null;
  return FAILURE_WORDING[reason] ?? reason;
}
