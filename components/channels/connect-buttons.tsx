import type { CSSProperties } from "react";
import type { ChannelPlatform } from "@prisma/client";
import { ArrowUpRight } from "lucide-react";

import { PlatformMark } from "@/components/ui/platform-badge";
import { cn } from "@/lib/utils";

import { connectHref } from "./channel-status";

export type MetaConfigured = { instagram: boolean; facebook: boolean };

type ConnectOption = {
  platform: ChannelPlatform;
  name: string;
  /** Only what stops someone connecting the wrong kind of account. */
  hint: string;
  cta: string;
  /** Spelled out in full so Tailwind keeps it. */
  hoverBorder: string;
};

const OPTIONS: readonly ConnectOption[] = [
  {
    platform: "INSTAGRAM",
    name: "Instagram",
    hint: "Business or creator account",
    cta: "Connect Instagram",
    hoverBorder: "hover:border-magenta",
  },
  {
    platform: "FACEBOOK",
    name: "Facebook Page",
    hint: "A Page you manage, not a profile",
    cta: "Connect Facebook Page",
    hoverBorder: "hover:border-blue",
  },
];

function isConfigured(configured: MetaConfigured, platform: ChannelPlatform): boolean {
  return platform === "INSTAGRAM" ? configured.instagram : configured.facebook;
}

const UNAVAILABLE = "Unavailable right now";

/**
 * The ways in: plain anchors, since the targets are route handlers that
 * redirect to Meta. `platforms` narrows it to what the workspace can still add.
 */
export function ConnectButtons({
  configured,
  platforms,
  className,
}: {
  configured: MetaConfigured;
  platforms?: readonly ChannelPlatform[];
  className?: string;
}) {
  const options = platforms ? OPTIONS.filter((o) => platforms.includes(o.platform)) : OPTIONS;
  return (
    <div className={cn("grid gap-2", options.length > 1 && "sm:grid-cols-2", className)}>
      {options.map((option, i) => {
        const enabled = isConfigured(configured, option.platform);
        const body = (
          <>
            <PlatformMark aria-hidden platform={option.platform} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{option.cta}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{enabled ? option.hint : UNAVAILABLE}</span>
            </span>
            {enabled ? (
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200 ease-soft group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
            ) : null}
          </>
        );
        return (
          <div key={option.platform} className="rise flex" style={{ "--i": i } as CSSProperties}>
            {enabled ? (
              <a
                href={connectHref(option.platform)}
                className={cn(
                  "lift group flex w-full items-center gap-3 rounded-2xl border bg-card p-3 pr-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  option.hoverBorder,
                )}
              >
                {body}
              </a>
            ) : (
              <div aria-disabled="true" className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 pr-4 opacity-60">
                {body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
