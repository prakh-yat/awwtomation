"use client";

import * as React from "react";
import { CornerDownRight } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

import { stagger } from "./stagger";
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
 * conversion is labelled between rows. On a phone the label sits above its bar.
 */
export function FunnelChart({ steps, className }: { steps: FunnelDatum[]; className?: string }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const [hover, setHover] = React.useState<string | null>(null);

  return (
    <ol className={cn("space-y-1.5", className)}>
      {steps.map((step, i) => {
        const width = Math.max((step.value / max) * 100, step.value > 0 ? 1.5 : 0);
        const color = ordinalColor(i, steps.length);
        const dim = hover !== null && hover !== step.key;
        return (
          <li key={step.key} className="rise" style={stagger(i)}>
            {i > 0 ? (
              <p className="py-1 sm:pl-[10.25rem]">
                <span className="inline-flex items-center gap-1 rounded-full bg-fog px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  <CornerDownRight className="h-3 w-3" aria-hidden />
                  {step.conversion === null ? "–" : `${pct(step.conversion)} of previous step`}
                </span>
              </p>
            ) : null}
            <div
              className="grid gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-[9.5rem_1fr] sm:items-center sm:gap-3"
              tabIndex={0}
              onMouseEnter={() => setHover(step.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(step.key)}
              onBlur={() => setHover(null)}
              aria-label={`${step.label}: ${formatNumber(step.value)}${step.conversion !== null ? `, ${pct(step.conversion)} of previous step` : ""}`}
            >
              <span className="text-[13px] font-medium leading-tight text-muted-foreground">{step.label}</span>
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-6 min-w-0 flex-1">
                  <div
                    className="h-full rounded-r-[4px] transition-opacity duration-150"
                    style={{ width: `${width}%`, backgroundColor: color, opacity: dim ? 0.4 : 1 }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums">{formatNumber(step.value)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
