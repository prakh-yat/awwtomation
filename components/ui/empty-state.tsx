import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { TONES, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** A lucide icon component (`icon={Inbox}`) or an already-rendered element. */
  icon?: LucideIcon | React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary call to action, usually a <Button>. */
  action?: React.ReactNode;
  /** Colour of the icon tile; usually the section's own. */
  tone?: Tone;
  /** A tighter version for panels and popovers. */
  compact?: boolean;
}

/**
 * The empty state every list uses: a colour tile on the site's faint grid, a
 * short title, one line at most, and a single next step.
 */
function EmptyState({ icon, title, description, action, tone = "yellow", compact = false, className, ...props }: EmptyStateProps) {
  let iconNode: React.ReactNode = null;
  if (icon) {
    if (React.isValidElement(icon)) {
      iconNode = icon;
    } else {
      const Icon = icon;
      iconNode = <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} strokeWidth={1.9} />;
    }
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-fog text-center",
        compact ? "px-6 py-10" : "px-6 py-16",
        className,
      )}
      {...props}
    >
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [--grid-size:40px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      {iconNode ? (
        <div
          className={cn(
            "relative mb-5 flex rotate-[-4deg] items-center justify-center rounded-2xl shadow-[0_10px_24px_-12px_rgb(15_15_15/0.45)]",
            compact ? "h-12 w-12" : "h-14 w-14",
            TONES[tone].solid,
          )}
        >
          {iconNode}
        </div>
      ) : null}
      <h3 className={cn("relative font-semibold text-ink", compact ? "text-[15px]" : "text-lg")}>{title}</h3>
      {description ? <p className="relative mt-1.5 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="relative mt-6">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
