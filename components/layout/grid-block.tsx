import * as React from "react";

import { TONES, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/** True for the tones whose solid block takes white text (and so white grid lines). */
export function isDarkTone(tone: Tone): boolean {
  return TONES[tone].solid.includes("text-white");
}

/**
 * The site's faint square grid, as a layer behind the content of a coloured
 * block. The parent needs `relative isolate` (GridBlock has both).
 *
 * The classes are joined by hand, never through `cn`: tailwind-merge reads
 * `bg-grid` and `bg-grid-light` as background colours and keeps only the last
 * one, which would drop the grid or the block's own colour.
 */
export function GridLines({ tone, size = "56px", className }: { tone: Tone; size?: string; className?: string }) {
  const base = isDarkTone(tone) ? "bg-grid bg-grid-light" : "bg-grid";
  return (
    <span
      aria-hidden
      className={`${base} pointer-events-none absolute inset-0 -z-10${className ? ` ${className}` : ""}`}
      style={{ "--grid-size": size } as React.CSSProperties}
    />
  );
}

export interface GridBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: Tone;
  /** Any CSS length. Full-bleed blocks use big cells, as the site does. */
  gridSize?: string;
}

/**
 * The flat colour block the first screens are built around: sign in, the
 * invite banner, errors. One per screen, never a gradient.
 */
export function GridBlock({ tone, gridSize = "56px", className, children, ...props }: GridBlockProps) {
  return (
    <div className={cn("relative isolate overflow-hidden", TONES[tone].solid, className)} {...props}>
      <GridLines tone={tone} size={gridSize} />
      {children}
    </div>
  );
}
