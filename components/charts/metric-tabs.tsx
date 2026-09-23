"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import type { TrendPoint } from "./series";
import { TrendChart } from "./trend-chart";

export type MetricTab = {
  key: string;
  label: string;
  /** Pre-formatted headline figure, shown by the KPI strip above the chart. */
  value: string;
  delta?: number | string | null;
  upIsGood?: boolean;
  kind?: "count" | "percent";
  data: TrendPoint[];
};

/**
 * The trend chart with a switcher for which metric it draws, this period
 * against the one before. One metric at a time keeps the chart to one axis and
 * one accent colour; the numbers themselves sit in the KPI strip, so the
 * switcher only has to name them. It scrolls sideways on a phone rather than
 * squeezing the labels.
 */
export function MetricTabs({
  metrics,
  initialKey,
  height = 260,
  fill = false,
}: {
  metrics: MetricTab[];
  initialKey?: string;
  height?: number;
  /** Stretch the chart to fill a taller container, e.g. a grid row set by its neighbour. */
  fill?: boolean;
}) {
  const id = React.useId();
  const [activeKey, setActiveKey] = React.useState(initialKey ?? metrics[0]?.key);
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, metrics.findIndex((m) => m.key === activeKey));
  const active = metrics[activeIndex];

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (activeIndex + step + metrics.length) % metrics.length;
    setActiveKey(metrics[next].key);
    refs.current[next]?.focus();
  }

  if (!active) return null;

  return (
    <div className={cn(fill && "flex h-full flex-col")}>
      <div className="px-5 pt-5">
        <div
          role="tablist"
          aria-label="Chart"
          onKeyDown={onKeyDown}
          className="scrollbar-none inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-fog p-1"
        >
          {metrics.map((m, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={m.key}
                ref={(node) => {
                  refs.current[i] = node;
                }}
                id={`${id}-tab-${m.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveKey(m.key)}
                className={cn(
                  "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-ink text-white" : "text-muted-foreground hover:bg-background hover:text-ink",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active.key}`} className={cn("p-5 pt-4", fill && "min-h-0 flex-1")}>
        <TrendChart data={active.data} label={active.label} kind={active.kind} height={height} fill={fill} />
      </div>
    </div>
  );
}
