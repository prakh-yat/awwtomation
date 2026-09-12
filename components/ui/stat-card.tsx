import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /**
   * Change versus the previous period. A number is treated as a percentage
   * (0.12 → "+12%"); a string is rendered as-is.
   */
  delta?: number | string;
  /** Small muted line under the value, e.g. "vs last 7 days". */
  hint?: React.ReactNode;
  icon?: LucideIcon;
}

function formatDelta(delta: number): string {
  const pct = Math.round(delta * 1000) / 10;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function StatCard({ label, value, delta, hint, icon: Icon, className, ...props }: StatCardProps) {
  const numericDelta = typeof delta === "number" ? delta : null;
  const deltaTone =
    numericDelta === null ? "neutral" : numericDelta > 0 ? "up" : numericDelta < 0 ? "down" : "neutral";
  const DeltaIcon = deltaTone === "up" ? ArrowUpRight : deltaTone === "down" ? ArrowDownRight : Minus;

  return (
    <div className={cn("rounded-lg border bg-card p-5 shadow-card", className)} {...props}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {delta !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
              deltaTone === "up" && "text-success",
              deltaTone === "down" && "text-destructive",
              deltaTone === "neutral" && "text-muted-foreground",
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {typeof delta === "number" ? formatDelta(delta) : delta}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export { StatCard };
