import * as React from "react";

import { TONES, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** A <Delta /> or any short line under the number. */
  meta?: React.ReactNode;
  /**
   * `plain` is a hairline card; any tone fills the block with that colour, as
   * the site does for the number it wants you to notice first.
   */
  tone?: Tone | "plain";
}

/** One number with its label: the building block of every report strip. */
function Stat({ label, value, meta, tone = "plain", className, ...props }: StatProps) {
  const filled = tone !== "plain";
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-2xl p-5",
        filled ? TONES[tone].solid : "border bg-card",
        className,
      )}
      {...props}
    >
      <span className={cn("brand-label truncate", filled ? null : "text-muted-foreground")}>{label}</span>
      <div className="min-w-0">
        <div data-stat-value="" className="font-display truncate text-[34px] leading-none tabular-nums">{value}</div>
        {meta ? <div className={cn("mt-2 text-[12px]", filled ? null : "text-muted-foreground")}>{meta}</div> : null}
      </div>
    </div>
  );
}

export { Stat };
