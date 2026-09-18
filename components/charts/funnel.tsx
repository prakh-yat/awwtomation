"use client";

import * as React from "react";

import { cn, formatNumber } from "@/lib/utils";

import { ordinalColor } from "./tokens";

export type FunnelDatum = {
  key: string;
  label: string;
  value: number;
  /** Share of the previous step; null for the first step or when the previous step was 0. */
  conversion: number | null;
};

function pct(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 && value > 0 ? 1 : 0)}%`;
}

/**
 * Horizontal funnel: each step is a bar scaled to the first step, darker as it
 * narrows (the steps are ordered, so an ordinal ramp is honest here). Values sit
 * outside the bar end so they never get clipped by a short bar, and the step-to-step
 * conversion is labelled between rows.
 */
export function FunnelChart({ steps, className }: { steps: FunnelDatum[]; className?: string }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const [hover, setHover] = React.useState<string | null>(null);

  return (
    <ol className={cn("space-y-1", className)}>
      {steps.map((step, i) => {
        const width = Math.max((step.value / max) * 100, step.value > 0 ? 1.5 : 0);
        const color = ordinalColor(i, steps.length);
        const dim = hover !== null && hover !== step.key;
        return (
          <li key={step.key}>
            {i > 0 ? (
              <p className="py-1 pl-[10rem] text-[11px] tabular-nums text-muted-foreground">
                {step.conversion === null ? "–" : `${pct(step.conversion)} of previous step`}
              </p>
            ) : null}
            <div
              className="grid grid-cols-[9.5rem_1fr] items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              tabIndex={0}
              onMouseEnter={() => setHover(step.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(step.key)}
              onBlur={() => setHover(null)}
              aria-label={`${step.label}: ${formatNumber(step.value)}${step.conversion !== null ? `, ${pct(step.conversion)} of previous step` : ""}`}
            >
              <span className="text-[13px] leading-tight text-muted-foreground">{step.label}</span>
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="h-5 min-w-0 flex-1">
                  <div
                    className="h-full rounded-r-[4px] transition-opacity"
                    style={{ width: `${width}%`, backgroundColor: color, opacity: dim ? 0.45 : 1 }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[13px] font-medium tabular-nums">{formatNumber(step.value)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
