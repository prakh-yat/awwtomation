import * as React from "react";

import { PlatformIcon, type PlatformIconPlatform } from "@/components/ui/platform-icon";
import { cn } from "@/lib/utils";

/**
 * Platform colours, used everywhere a channel is named: Instagram in magenta,
 * Facebook and Messenger in blue. Flat tiles, never the platforms' own
 * gradients.
 */
export const PLATFORM_TONE: Record<PlatformIconPlatform, { tile: string; soft: string; text: string; label: string; product: string }> = {
  INSTAGRAM: { tile: "bg-magenta text-white", soft: "bg-magenta-soft text-magenta-ink", text: "text-magenta-ink", label: "Instagram", product: "Instagram" },
  FACEBOOK: { tile: "bg-blue text-white", soft: "bg-blue-soft text-blue-ink", text: "text-blue-ink", label: "Facebook", product: "Messenger" },
};

export interface PlatformMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  platform: PlatformIconPlatform;
  /** Tile size in px; the glyph scales with it. */
  size?: number;
}

/** The platform glyph on its colour tile. */
function PlatformMark({ platform, size = 20, className, ...props }: PlatformMarkProps) {
  const glyph = Math.max(10, Math.round(size * 0.58));
  return (
    <span
      role="img"
      aria-label={PLATFORM_TONE[platform].label}
      className={cn("inline-flex shrink-0 items-center justify-center", PLATFORM_TONE[platform].tile, className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      {...props}
    >
      <PlatformIcon platform={platform} size={glyph} />
    </span>
  );
}

export interface PlatformBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  platform: PlatformIconPlatform;
  /** Show "Messenger" instead of "Facebook" where the conversation is what matters. */
  product?: boolean;
}

/** A soft pill with the glyph and the platform's name. */
function PlatformBadge({ platform, product = false, className, ...props }: PlatformBadgeProps) {
  const t = PLATFORM_TONE[platform];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-semibold", t.soft, className)} {...props}>
      <PlatformIcon platform={platform} size={11} />
      {product ? t.product : t.label}
    </span>
  );
}

export { PlatformMark, PlatformBadge };
