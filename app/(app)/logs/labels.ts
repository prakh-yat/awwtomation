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
  SKIPPED_DUPLICATE: "Skipped · duplicate",
  SKIPPED_RATE_LIMIT: "Skipped · rate limit",
  SKIPPED_SELF: "Skipped · self",
  SKIPPED_NOT_FOLLOWING: "Skipped · not following",
  SKIPPED_WINDOW: "Skipped · outside 24h window",
  SKIPPED_PLAN_LIMIT: "Skipped · plan limit",
  SKIPPED_OPTED_OUT: "Skipped · opted out",
};

/** Shorter form for the status badge inside the table, where "Skipped ·" is implied by the tone. */
export const STATUS_SHORT_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_DUPLICATE: "Duplicate",
  SKIPPED_RATE_LIMIT: "Rate limit",
  SKIPPED_SELF: "Self",
  SKIPPED_NOT_FOLLOWING: "Not following",
  SKIPPED_WINDOW: "Outside 24h",
  SKIPPED_PLAN_LIMIT: "Plan limit",
  SKIPPED_OPTED_OUT: "Opted out",
};

/** Why each outcome happens, in terms of the Meta rules the sender enforces (ARCHITECTURE §6). */
export const STATUS_HELP: Record<DeliveryStatus, string> = {
  SENT: "Meta accepted the message. Delivery to the person's inbox is handled by Instagram or Messenger from there.",
  FAILED: "Meta rejected the request — usually an expired connection, a person who can't be messaged, or content Meta doesn't allow. The reason column says which, and workspace admins can expand a row for the technical detail.",
  SKIPPED_DUPLICATE: "Meta allows one private reply per comment. A reply had already been sent for this comment, or the automation is set to message each person only once.",
  SKIPPED_RATE_LIMIT: "Instagram caps private replies at 750 per hour per account. Overflow is retried with backoff for up to 6 hours, then skipped.",
  SKIPPED_SELF: "The comment came from the connected account itself. Meta doesn't allow an account to message itself, and it would waste a private-reply slot.",
  SKIPPED_NOT_FOLLOWING: "The flow's follow gate checked the profile and the person isn't following the account yet. They get the retry prompt instead of the gated message.",
  SKIPPED_WINDOW: "Messenger and Instagram only allow DMs within 24 hours of the person's last message to you. Private replies to comments are exempt; follow-ups and broadcasts are not.",
  SKIPPED_PLAN_LIMIT: "The workspace used up this month's DM quota. Upgrade the plan under Settings → Billing to resume sending.",
  SKIPPED_OPTED_OUT: "The person asked to stop receiving messages (marked opted out on their contact record). Nothing automated will be sent to them.",
};

export const KIND_LABELS: Record<DeliveryKind, string> = {
  PRIVATE_REPLY: "Private reply",
  MESSAGE: "DM",
  PUBLIC_REPLY: "Public reply",
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
