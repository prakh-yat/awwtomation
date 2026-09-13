import * as React from "react";

import { cn } from "@/lib/utils";

import { Panel } from "./mock-parts";

const funnel = [
  { label: "Commented or messaged", value: 638 },
  { label: "Got a DM", value: 536 },
  { label: "Clicked or replied", value: 174 },
  { label: "Became a lead", value: 41 },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Five steps of ink, lightest to darkest. Written out in full so Tailwind keeps them. */
const SHADES = ["bg-foreground/[0.05]", "bg-foreground/15", "bg-foreground/30", "bg-foreground/55", "bg-foreground/85"];

/**
 * A believable week for a clothing shop in Kathmandu: quiet overnight, a bump
 * at lunch, most comments between 7 and 10 PM, Friday evening the busiest.
 * Deterministic, so the picture is identical on every render.
 */
function shade(day: number, hour: number): string {
  const evening = Math.exp(-((hour - 20.5) ** 2) / 4.5);
  const lunch = 0.42 * Math.exp(-((hour - 13) ** 2) / 3);
  const morning = 0.2 * Math.exp(-((hour - 9) ** 2) / 4);
  const weight = [0.8, 0.66, 0.7, 0.72, 0.82, 1, 0.9][day];
  // Small fixed jitter per cell so the week doesn't look stamped from one template.
  const jitter = ((((day + 3) * 7919 + (hour + 5) * 104729) % 11) - 5) * 0.035;
  const v = (evening + lunch + morning) * weight + (hour >= 8 ? jitter : 0);
  const level = v > 0.82 ? 4 : v > 0.55 ? 3 : v > 0.3 ? 2 : v > 0.1 ? 1 : 0;
  return SHADES[level];
}

/** Per-automation analytics: the funnel and the busiest-times grid. */
function AnalyticsVisual({ className }: { className?: string }) {
  const top = funnel[0].value;
  return (
    <Panel
      role="img"
      aria-label="Analytics for the Autumn collection link automation over 30 days: 638 people commented or messaged, 536 got a DM, 174 clicked or replied and 41 became leads. A grid of days and hours shows most comments arrive between 7 and 10 PM, busiest on Friday."
      className={className}
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <p className="truncate text-[13px] font-semibold">Autumn collection link</p>
        <p className="shrink-0 text-[12px] text-muted-foreground">Last 30 days</p>
      </div>

      <div className="px-5 pb-5 pt-4">
        <ol className="space-y-3">
          {funnel.map((step, i) => {
            const prev = i === 0 ? null : funnel[i - 1].value;
            return (
              <li key={step.label}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <p className="text-muted-foreground">{step.label}</p>
                  <p className="tabular-nums">
                    <span className="font-medium text-foreground">{step.value}</span>
                    <span className="ml-2 inline-block w-8 text-right text-muted-foreground">
                      {prev ? `${Math.round((step.value / prev) * 100)}%` : ""}
                    </span>
                  </p>
                </div>
                {/* Lavender shows where the previous step reached, so the drop-off is visible at a glance. */}
                <div className="relative mt-1.5 h-2 rounded-sm bg-muted">
                  {prev ? (
                    <div className="absolute inset-y-0 left-0 rounded-sm bg-lavender" style={{ width: `${(prev / top) * 100}%` }} />
                  ) : null}
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm bg-foreground"
                    style={{ width: `${Math.max(2, (step.value / top) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 border-t pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12px] font-medium">Busiest times</p>
            <p className="text-[11px] text-muted-foreground">Nepal Time</p>
          </div>
          <div className="mt-3 space-y-[3px]">
            {DAYS.map((d, day) => (
              <div key={d} className="grid grid-cols-[28px_repeat(24,minmax(0,1fr))] items-center gap-[3px]">
                <p className="text-[10px] leading-none text-muted-foreground">{d}</p>
                {HOURS.map((h) => (
                  <span key={h} className={cn("aspect-square rounded-[2px]", shade(day, h))} />
                ))}
              </div>
            ))}
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-[3px] pt-1">
              <span />
              <div className="relative h-3 text-[10px] leading-3 text-muted-foreground">
                {[
                  { h: 0, label: "12 AM" },
                  { h: 6, label: "6 AM" },
                  { h: 12, label: "12 PM" },
                  { h: 18, label: "6 PM" },
                ].map((t) => (
                  <span key={t.h} className="absolute top-0 whitespace-nowrap" style={{ left: `${(t.h / 24) * 100}%` }}>
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export { AnalyticsVisual };
