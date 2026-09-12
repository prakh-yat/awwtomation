import type { ChannelPlatform } from "@prisma/client";

import type { ChannelSummary } from "@/lib/services/channels";

/**
 * Pure presentation helpers shared by server and client components. Kept
 * free of service imports (types only) so they never drag Prisma into a
 * client bundle.
 */

/** Same threshold as lib/meta/tokens TOKEN_REFRESH_WINDOW_DAYS / services TOKEN_WARNING_DAYS. */
const TOKEN_WARNING_DAYS = 10;

export type StatusVariant = "success" | "warning" | "destructive" | "secondary";

export type ChannelStatusView = {
  label: string;
  variant: StatusVariant;
  /** True when the only fix is going through OAuth again. */
  needsReconnect: boolean;
};

export function channelStatusView(channel: Pick<ChannelSummary, "status" | "health">): ChannelStatusView {
  const days = channel.health.tokenDaysLeft;
  switch (channel.status) {
    case "DISCONNECTED":
      return { label: "Disconnected", variant: "secondary", needsReconnect: true };
    case "TOKEN_EXPIRED":
      return { label: "Expired", variant: "destructive", needsReconnect: true };
    case "ERROR":
      return { label: "Error", variant: "destructive", needsReconnect: true };
    case "ACTIVE":
      if (days !== null && days <= 0) return { label: "Expired", variant: "destructive", needsReconnect: true };
      if (days !== null && days <= TOKEN_WARNING_DAYS) {
        return { label: `Token expiring in ${days} day${days === 1 ? "" : "s"}`, variant: "warning", needsReconnect: false };
      }
      return { label: "Active", variant: "success", needsReconnect: false };
  }
}

export const PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook Page",
};

export function channelDisplayName(channel: Pick<ChannelSummary, "username" | "name" | "externalId">): string {
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? channel.externalId;
}

/** Start-of-OAuth URL. Plain `<a href>`, never `<Link>` — it's a route handler, not a page. */
export function connectHref(platform: ChannelPlatform): string {
  return `/api/meta/${platform.toLowerCase()}/start`;
}
