import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

function formatDelta(delta: number): string {
  const pct = Math.abs(delta) >= 10 ? Math.round(delta * 100) : Math.round(delta * 1000) / 10;
  // A true minus sign lines up with the plus; a hyphen reads short and low.
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : "\u2212"}${Math.abs(pct)}%`;
}

/**
 * Change versus the previous period. A number is a ratio (0.12 → "+12%"); a
 * string renders as-is ("New"). Colour says whether the change is good news,
 * the arrow says which way it went, so neither carries the meaning alone.
 */
export function Delta({ value, upIsGood = true, className }: { value: number | string | null | undefined; upIsGood?: boolean; className?: string }) {
  if (typeof value === "string") {
    return <span className={cn("text-xs font-medium text-muted-foreground", className)}>{value}</span>;
  }
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value === 0) {
    return <span className={cn("text-xs font-medium text-muted-foreground", className)}>No change</span>;
  }
  const up = value > 0;
  const good = up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", good ? "text-success" : "text-destructive", className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {formatDelta(value)}
    </span>
  );
}
