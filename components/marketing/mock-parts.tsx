import * as React from "react";

import { PLATFORM_TONE } from "@/components/ui/platform-badge";
import { PlatformIcon, type PlatformIconPlatform } from "@/components/ui/platform-icon";
import { cn } from "@/lib/utils";

/*
 * Building blocks for the product pictures on the marketing pages. They copy
 * the app's own look (fog initials, hairline cards, pill tags, platform
 * colours) so what people see here matches what they see after signing in.
 * Every example uses the same shop, Himalayan Threads, and the same customers.
 */

/** A card that stands in for a piece of product UI. The soft shadow lifts it off a colour block. */
function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-background text-ink shadow-[0_1px_2px_rgb(15_15_15/0.05),0_28px_56px_-30px_rgb(15_15_15/0.45)]",
        className,
      )}
      {...props}
    />
  );
}

export interface AvatarProps {
  initials: string;
  size?: number;
  /** Solid ink circle, used for the business's own account. */
  ink?: boolean;
  platform?: PlatformIconPlatform;
  className?: string;
}

/** Initials avatar with an optional platform badge in the platform's colour, like the inbox and contacts lists. */
function Avatar({ initials, size = 32, ink = false, platform, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        ink ? "bg-ink text-white" : "bg-fog text-ink/70 ring-1 ring-inset ring-ink/10",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) }}
    >
      {initials}
      {platform ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex size-[15px] items-center justify-center rounded-full ring-2 ring-background",
            PLATFORM_TONE[platform].tile,
          )}
        >
          <PlatformIcon platform={platform} size={8} />
        </span>
      ) : null}
    </span>
  );
}

/** Small pill tag, as used for contact tags and keywords in the app. */
function Chip({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full bg-fog px-2 text-[11px] font-semibold leading-[18px] text-ink/80",
        className,
      )}
      {...props}
    />
  );
}

export { Panel, Avatar, Chip };
