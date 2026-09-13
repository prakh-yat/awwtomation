import type { ChannelPlatform } from "@prisma/client";

import type { ChannelView } from "@/lib/services/channels";

/**
 * Pure presentation helpers shared by server and client components. Kept
 * free of service imports (types only) so they never drag Prisma into a
 * client bundle.
 */

export type StatusVariant = "success" | "warning" | "destructive" | "secondary";

export type ChannelStatusView = {
  label: string;
  variant: StatusVariant;
  /** One sentence under the stats saying what's going on, or null when all is well. */
  detail: string | null;
  /** True when the only fix is signing in with Meta again. */
  needsReconnect: boolean;
};

export function channelStatusView(channel: Pick<ChannelView, "platform" | "health">): ChannelStatusView {
  const platform = channel.platform === "INSTAGRAM" ? "Instagram" : "Facebook";
  const { state, daysLeft, problem } = channel.health;
  switch (state) {
    case "disconnected":
      return { label: "Disconnected", variant: "secondary", detail: "Automations on this account are off until you reconnect it.", needsReconnect: true };
    case "reconnect":
      return { label: "Reconnect needed", variant: "destructive", detail: problem ?? `${platform} signed this account out. Reconnect to keep automations running.`, needsReconnect: true };
    case "not_receiving":
      return { label: "Not receiving", variant: "warning", detail: problem ?? "New comments and messages aren't reaching Awwtomation. Reconnecting usually fixes this.", needsReconnect: true };
    case "expiring":
      return {
        label: "Reconnect soon",
        variant: "warning",
        detail: `${platform} asks you to sign in again every 60 days. ${daysLeft === 1 ? "One day" : `${daysLeft} days`} left.`,
        needsReconnect: false,
      };
    case "ok":
    default:
      return { label: "Connected", variant: "success", detail: null, needsReconnect: false };
  }
}

export const PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook Page",
};

export function channelDisplayName(channel: Pick<ChannelView, "username" | "name" | "platform">): string {
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? PLATFORM_LABEL[channel.platform];
}

/** Start-of-OAuth URL. Plain `<a href>`, never `<Link>`: it's a route handler, not a page. */
export function connectHref(platform: ChannelPlatform): string {
  return `/api/meta/${platform.toLowerCase()}/start`;
}
