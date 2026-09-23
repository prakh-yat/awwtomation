import { PlatformMark } from "@/components/ui/platform-badge";
import type { ChannelOption } from "@/lib/services/automations";
import { cn } from "@/lib/utils";

type ChannelName = Pick<ChannelOption, "username" | "name" | "platform">;

/** "@handle", else the Page name, else what kind of account it is. */
export function channelHandle(channel: ChannelName): string {
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? (channel.platform === "INSTAGRAM" ? "Instagram account" : "Facebook Page");
}

/** The platform tile and the handle: how an account is named across the automations pages. */
export function ChannelLabel({ channel, size = 18, className }: { channel: ChannelName; size?: number; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <PlatformMark platform={channel.platform} size={size} />
      <span className="truncate">{channelHandle(channel)}</span>
    </span>
  );
}
