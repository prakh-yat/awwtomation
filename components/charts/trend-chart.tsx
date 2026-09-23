"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

import { cn, formatNumber } from "@/lib/utils";

import type { TrendPoint } from "./series";
import { VIZ } from "./tokens";

export type { TrendPoint };

function day(value: unknown, pattern: string): string {
  if (typeof value !== "string") return "";
  try {
    return format(parseISO(value), pattern);
  } catch {
    return value;
  }
}

function clean(value: number, kind: "count" | "percent"): string {
  return kind === "percent" ? `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%` : formatNumber(value);
}

function LineKey({ color, dashed = false }: { color: string; dashed?: boolean }) {
  if (dashed) {
    return (
      <svg width="14" height="2" className="inline-block" aria-hidden>
        <line x1="0" y1="1" x2="14" y2="1" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
    );
  }
  return <span className="inline-block h-[2px] w-3.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />;
}

/**
 * One metric over time. The current period is the accent line with a light wash;
 * the previous period, when given, is a thinner dashed gray line on the same axis
 * so "better or worse than last time" reads without a second scale, and a busy
 * previous week never out-shouts the one being looked at. The crosshair snaps to the
 * nearest day and the tooltip lists both values.
 */
export function TrendChart({
  data,
  label,
  compare = true,
  kind = "count",
  height = 240,
  fill = false,
  className,
}: {
  data: TrendPoint[];
  /** What the value is, e.g. "DMs sent". Used in the legend, tooltip and table. */
  label: string;
  compare?: boolean;
  kind?: "count" | "percent";
  /** Minimum plot height; with `fill` the plot also grows to the parent's height. */
  height?: number;
  fill?: boolean;
  className?: string;
}) {
  const [asTable, setAsTable] = React.useState(false);
  const hasPrevious = compare && data.some((p) => p.previous !== undefined);
  const empty = data.every((p) => p.value === 0 && (p.previous ?? 0) === 0);

  const renderTooltip = React.useCallback(
    ({ active, payload }: TooltipContentProps) => {
      if (!active || !payload || payload.length === 0) return null;
      const point = payload[0]?.payload as TrendPoint | undefined;
      if (!point) return null;
      return (
        <div className="min-w-[170px] rounded-xl border bg-background px-3 py-2.5 text-xs shadow-elevated">
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <LineKey color={VIZ.accent} />
              {day(point.date, "EEE, MMM d")}
            </span>
            <span className="text-sm font-semibold tabular-nums text-ink">{clean(point.value, kind)}</span>
          </div>
          {hasPrevious && point.previous !== undefined ? (
            <div className="mt-1.5 flex items-center justify-between gap-6">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <LineKey color={VIZ.context} dashed />
                {point.previousDate ? day(point.previousDate, "EEE, MMM d") : "Previous period"}
              </span>
              <span className="font-medium tabular-nums text-muted-foreground">{clean(point.previous, kind)}</span>
            </div>
          ) : null}
        </div>
      );
    },
    [hasPrevious, kind],
  );

  return (
    <div className={cn(fill ? "flex h-full flex-col gap-3" : "space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <LineKey color={VIZ.accent} />
            {hasPrevious ? "This period" : label}
          </span>
          {hasPrevious ? (
            <span className="flex items-center gap-1.5">
              <LineKey color={VIZ.context} dashed />
              Previous period
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-fog hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-[320px] overflow-auto rounded-xl border scrollbar-thin">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-fog text-muted-foreground">
              <tr>
                <th className="brand-label px-3 py-2.5 text-left font-normal">Date</th>
                <th className="brand-label px-3 py-2.5 text-right font-normal">{label}</th>
                {hasPrevious ? <th className="brand-label px-3 py-2.5 text-right font-normal">Previous period</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1.5 text-muted-foreground">{day(p.date, "EEE, MMM d")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{clean(p.value, kind)}</td>
                  {hasPrevious ? <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{clean(p.previous ?? 0, kind)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={cn("relative", fill && "min-h-0 flex-1")} style={fill ? { minHeight: height } : { height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => day(v, "MMM d")}
                tick={{ fontSize: 11, fill: VIZ.axis }}
                tickLine={false}
                axisLine={{ stroke: VIZ.grid }}
                minTickGap={32}
                interval="preserveStartEnd"
                height={26}
              />
              <YAxis
                width={44}
                allowDecimals={kind === "percent"}
                tick={{ fontSize: 11, fill: VIZ.axis }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => clean(Number(v), kind)}
              />
              <Tooltip content={renderTooltip} cursor={{ stroke: VIZ.axis, strokeWidth: 1, strokeOpacity: 0.35 }} isAnimationActive={false} />
              {hasPrevious ? (
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Previous period"
                  stroke={VIZ.context}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, fill: VIZ.context, stroke: VIZ.surface, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="value"
                name={label}
                stroke={VIZ.accent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={VIZ.accentWash}
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 4, fill: VIZ.accent, stroke: VIZ.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {empty ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-6">
              <p className="rounded-full border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground">Nothing in this period yet</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
