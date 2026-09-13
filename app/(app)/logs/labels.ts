import type { DeliveryKind, DeliveryStatus } from "@prisma/client";

/** Display order for selects, chips and the help popover: outcomes first, then skips in the order the sender checks them. */
export const STATUS_ORDER: readonly DeliveryStatus[] = [
  "SENT",
  "FAILED",
  "SKIPPED_DUPLICATE",
  "SKIPPED_RATE_LIMIT",
  "SKIPPED_SELF",
  "SKIPPED_NOT_FOLLOWING",
  "SKIPPED_WINDOW",
  "SKIPPED_PLAN_LIMIT",
  "SKIPPED_OPTED_OUT",
];

export const KIND_ORDER: readonly DeliveryKind[] = ["PRIVATE_REPLY", "MESSAGE", "PUBLIC_REPLY", "BROADCAST"];

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_DUPLICATE: "Not sent: already replied",
  SKIPPED_RATE_LIMIT: "Not sent: hourly limit",
  SKIPPED_SELF: "Not sent: own account",
  SKIPPED_NOT_FOLLOWING: "Not sent: not following",
  SKIPPED_WINDOW: "Not sent: outside 24-hour window",
  SKIPPED_PLAN_LIMIT: "Not sent: monthly limit reached",
  SKIPPED_OPTED_OUT: "Not sent: opted out",
};

/** Shorter form for chips and the badge inside the table. */
export const STATUS_SHORT_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_DUPLICATE: "Already replied",
  SKIPPED_RATE_LIMIT: "Hourly limit",
  SKIPPED_SELF: "Own account",
  SKIPPED_NOT_FOLLOWING: "Not following",
  SKIPPED_WINDOW: "Outside 24 hours",
  SKIPPED_PLAN_LIMIT: "Monthly limit",
  SKIPPED_OPTED_OUT: "Opted out",
};

/** Why each outcome happens, in terms of the Meta rules the sender enforces (ARCHITECTURE §6). */
export const STATUS_HELP: Record<DeliveryStatus, string> = {
  SENT: "The message was accepted by Instagram or Messenger and delivered to the person's inbox.",
  FAILED: "Instagram or Messenger didn't accept the message. Open the row to see why and what to do next.",
  SKIPPED_DUPLICATE: "Instagram allows one DM per comment. Either this comment already had one, or the automation only messages each person once.",
  SKIPPED_RATE_LIMIT: "Instagram limits how many DMs an account can send in reply to comments each hour. Anything over the limit is retried for up to 6 hours before it's skipped.",
  SKIPPED_SELF: "The comment was posted by the connected account itself, and an account can't message itself.",
  SKIPPED_NOT_FOLLOWING: "The automation only sends to followers, and this person wasn't following yet. They were asked to follow first.",
  SKIPPED_WINDOW: "You can only message someone within 24 hours of their last message to you. Replies to comments don't count toward this; follow-ups and broadcasts do.",
  SKIPPED_PLAN_LIMIT: "This workspace has used all of this month's DMs. Upgrade the plan to keep sending.",
  SKIPPED_OPTED_OUT: "This person asked not to receive messages, so automations skip them.",
};

/** Same words as the automation report and contact timeline: a DM is a DM, wherever it started. */
export const KIND_LABELS: Record<DeliveryKind, string> = {
  PRIVATE_REPLY: "DM from comment",
  MESSAGE: "DM",
  PUBLIC_REPLY: "Comment reply",
  BROADCAST: "Broadcast",
};

export type StatusBadgeVariant = "success" | "destructive" | "secondary";

export function statusVariant(status: DeliveryStatus): StatusBadgeVariant {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "destructive";
  return "secondary";
}

export function isSkipStatus(status: DeliveryStatus): boolean {
  return status !== "SENT" && status !== "FAILED";
}
