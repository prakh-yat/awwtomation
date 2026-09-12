import type { AutomationStatus, ChannelStatus, DeliveryKind, DeliveryStatus } from "@prisma/client";

/** Human copy for delivery outcomes, shared by the activity feed and the skip-reasons card. */
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_DUPLICATE: "Already sent",
  SKIPPED_RATE_LIMIT: "Rate limited",
  SKIPPED_SELF: "Own account",
  SKIPPED_NOT_FOLLOWING: "Not following",
  SKIPPED_WINDOW: "Outside 24h window",
  SKIPPED_PLAN_LIMIT: "Plan limit reached",
  SKIPPED_OPTED_OUT: "Opted out",
};

export const DELIVERY_KIND_LABELS: Record<DeliveryKind, string> = {
  PRIVATE_REPLY: "private reply",
  MESSAGE: "DM",
  PUBLIC_REPLY: "public reply",
  BROADCAST: "broadcast",
};

export type StatusTone = "success" | "destructive" | "muted";

export function deliveryTone(status: DeliveryStatus): StatusTone {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "destructive";
  return "muted";
}

export function channelTone(status: ChannelStatus): StatusTone {
  if (status === "ACTIVE") return "success";
  if (status === "DISCONNECTED") return "muted";
  return "destructive";
}

export const CHANNEL_STATUS_LABELS: Record<ChannelStatus, string> = {
  ACTIVE: "Active",
  TOKEN_EXPIRED: "Reconnect needed",
  DISCONNECTED: "Disconnected",
  ERROR: "Error",
};

export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  DRAFT: "Draft",
};

/** Tailwind classes for the 6px status dot used across the dashboard. */
export const TONE_DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-success",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/50",
};

/** "@handle" from whichever identifier we have; falls back to the display name. */
export function contactHandle(username: string | null | undefined, name?: string | null): string {
  const clean = username?.trim().replace(/^@/, "");
  if (clean) return `@${clean}`;
  return name?.trim() || "a contact";
}
