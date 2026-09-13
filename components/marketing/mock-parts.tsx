import * as React from "react";

import { PlatformIcon, type PlatformIconPlatform } from "@/components/ui/platform-icon";
import { cn } from "@/lib/utils";

/*
 * Building blocks for the product pictures on the marketing pages. They copy
 * the app's own look (gray initials, hairline cards, small gray tags) so what
 * people see here matches what they see after signing in. Every example uses
 * the same shop, Himalayan Threads, and the same customers.
 */

/** A card that stands in for a piece of product UI. */
function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-background shadow-[0_1px_2px_rgb(24_24_27/0.04),0_18px_40px_-24px_rgb(24_24_27/0.28)]",
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

/** Initials avatar with an optional Instagram/Facebook badge, like the inbox and contacts lists. */
function Avatar({ initials, size = 32, ink = false, platform, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium",
        ink ? "bg-foreground text-background" : "bg-muted text-foreground/70 ring-1 ring-inset ring-border",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) }}
    >
      {initials}
      {platform ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-[15px] items-center justify-center rounded-full bg-background text-foreground ring-1 ring-border">
          <PlatformIcon platform={platform} size={9} />
        </span>
      ) : null}
    </span>
  );
}

/** Small gray tag, as used for contact tags and keywords in the app. */
function Chip({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border bg-muted/60 px-1.5 text-[11px] font-medium leading-[18px] text-foreground/80",
        className,
      )}
      {...props}
    />
  );
}

export { Panel, Avatar, Chip };
