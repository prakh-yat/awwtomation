"use client";

import Link from "next/link";

import { cn, formatNumber } from "@/lib/utils";

import type { ShellUsage } from "./types";

function resetLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/**
 * This month's DM allowance, pinned above the account menu. It's the number
 * people most need to keep an eye on, and the natural moment to upgrade.
 */
export function UsageMeter({
  usage,
  collapsed,
  onNavigate,
}: {
  usage: ShellUsage;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const ratio = usage.limit > 0 ? Math.min(usage.used / usage.limit, 1) : 0;
  const pct = Math.round(ratio * 100);
  const tone = ratio >= 1 ? "destructive" : ratio >= 0.8 ? "warning" : "normal";
  const summary = `${formatNumber(usage.used)} of ${formatNumber(usage.limit)} DMs this month`;

  if (collapsed) {
    // A ring reads at 40px wide where a bar and numbers can't.
    const r = 13;
    const circumference = 2 * Math.PI * r;
    return (
      <Link
        href="/usage"
        onClick={onNavigate}
        aria-label={summary}
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3" className="stroke-border" />
          <circle
            cx="16"
            cy="16"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            transform="rotate(-90 16 16)"
            className={cn(tone === "destructive" ? "stroke-destructive" : tone === "warning" ? "stroke-warning" : "stroke-foreground")}
          />
          {/* The number keeps a nearly empty ring from reading as a loading spinner. */}
          <text x="16" y="16.5" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-[8px] font-medium tabular-nums">
            {pct}%
          </text>
        </svg>
      </Link>
    );
  }

  return (
    <Link
      href="/usage"
      onClick={onNavigate}
      className="block rounded-lg border border-lavender/70 bg-lavender/20 p-3 outline-none transition-colors hover:bg-lavender/30 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">DMs this month</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-background ring-1 ring-inset ring-lavender/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.used}
        aria-label={summary}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-foreground",
          )}
          style={{ width: `${Math.max(pct, usage.used > 0 ? 2 : 0)}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{formatNumber(usage.used)}</span> / {formatNumber(usage.limit)} · resets{" "}
        {resetLabel(usage.resetsAt)}
      </p>
    </Link>
  );
}
