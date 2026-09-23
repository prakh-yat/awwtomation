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
        className="mx-auto flex h-full w-full items-center justify-center rounded-[28%] bg-fog outline-none transition-colors hover:bg-[hsl(0_0%_92%)] focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Sized off the dock slot (a size container), so it grows with the tile. */}
        <svg viewBox="0 0 32 32" aria-hidden className="h-[70cqw] w-[70cqw]">
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3" className="stroke-white" />
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
            className={cn(tone === "destructive" ? "stroke-destructive" : tone === "warning" ? "stroke-orange" : "stroke-purple")}
          />
          {/* The number keeps a nearly empty ring from reading as a loading spinner. */}
          <text x="16" y="16.5" textAnchor="middle" dominantBaseline="middle" className="fill-ink text-[8px] font-bold tabular-nums">
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
      className="block rounded-2xl bg-fog p-3.5 outline-none transition-colors hover:bg-[hsl(0_0%_93%)] focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="brand-label text-muted-foreground">DMs this month</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-background"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.used}
        aria-label={summary}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-orange" : "bg-purple",
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
