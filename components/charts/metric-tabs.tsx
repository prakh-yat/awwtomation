"use client";

import * as React from "react";

import { Delta } from "@/components/ui/delta";
import { cn } from "@/lib/utils";

import type { TrendPoint } from "./series";
import { TrendChart } from "./trend-chart";

export type MetricTab = {
  key: string;
  label: string;
  /** Pre-formatted headline figure. */
  value: string;
  delta?: number | string | null;
  upIsGood?: boolean;
  kind?: "count" | "percent";
  data: TrendPoint[];
};

const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
};

/**
 * Headline numbers that double as the chart's switcher: pick a metric and the
 * trend below redraws for it, this period against the one before. One metric
 * at a time keeps the chart to one axis and one accent colour.
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
      <div role="tablist" aria-label="Metric" onKeyDown={onKeyDown} className={cn("grid border-b", GRID_COLS[metrics.length] ?? "grid-cols-2 sm:grid-cols-4")}>
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
                "relative -mb-px -ml-px border-b border-l px-5 py-4 text-left outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected ? "bg-card" : "bg-muted/40 hover:bg-muted/70",
              )}
            >
              <span className={cn("block text-[13px]", selected ? "text-foreground" : "text-muted-foreground")}>{m.label}</span>
              <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[22px] font-semibold leading-none tracking-tight">{m.value}</span>
                <Delta value={m.delta} upIsGood={m.upIsGood} />
              </span>
              {selected ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active.key}`} className={cn("p-5", fill && "min-h-0 flex-1")}>
        <TrendChart data={active.data} label={active.label} kind={active.kind} height={height} fill={fill} />
      </div>
    </div>
  );
}
