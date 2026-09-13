"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

import { cn, formatNumber } from "@/lib/utils";

import { VIZ } from "./tokens";

export type ColumnDatum = {
  key: string;
  label: string;
  value: number;
  /** Rendered in the context gray instead of the accent (e.g. a month in progress). */
  muted?: boolean;
};

/**
 * Axis top for four equal intervals on round numbers: the interval is rounded up
 * to 1, 2, 2.5 or 5 × a power of ten, so the axis reads 0 / 100 / 200 / 300 / 400
 * rather than 0 / 66 / 132 / 197 / 263.
 */
function niceCeil(value: number): number {
  const raw = Math.max(value / 4, 1);
  const base = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / base;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return step * base * 4;
}

/**
 * Columns for a short ordered series such as months. Bars are capped at 24px and
 * rounded only at the data end. An optional reference line marks a limit on the
 * same axis — never a second scale.
 */
export function ColumnChart({
  data,
  valueLabel,
  limit,
  limitLabel = "Limit",
  height = 220,
  className,
}: {
  data: ColumnDatum[];
  valueLabel: string;
  limit?: number;
  limitLabel?: string;
  height?: number;
  className?: string;
}) {
  const renderTooltip = React.useCallback(
    ({ active, payload }: TooltipContentProps) => {
      if (!active || !payload || payload.length === 0) return null;
      const d = payload[0]?.payload as ColumnDatum | undefined;
      if (!d) return null;
      return (
        <div className="min-w-[150px] rounded-lg border bg-background px-3 py-2.5 text-xs shadow-elevated">
          <p className="text-sm font-semibold tabular-nums">{formatNumber(d.value)}</p>
          <p className="mt-0.5 text-muted-foreground">
            {valueLabel} · {d.label}
          </p>
          {limit ? <p className="mt-0.5 text-muted-foreground">{Math.round((d.value / limit) * 100)}% of {limitLabel.toLowerCase()}</p> : null}
        </div>
      );
    },
    [limit, limitLabel, valueLabel],
  );

  const dataMax = Math.max(0, ...data.map((d) => d.value));
  // A limit far above anything used flattens every bar to nothing. Only draw it
  // once usage gets within sight of it; the card's copy states the limit anyway.
  const showLimit = Boolean(limit && dataMax >= limit * 0.25);
  const top = niceCeil(Math.max(showLimit ? (limit ?? 0) : 0, dataMax, 1) * 1.05);

  return (
    <div className={cn("relative", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={VIZ.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: VIZ.axis }} tickLine={false} axisLine={{ stroke: VIZ.grid }} height={26} />
          <YAxis
            width={44}
            domain={[0, top]}
            ticks={[0, top / 4, top / 2, (top * 3) / 4, top]}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: VIZ.axis }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatNumber(Number(v))}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: "rgba(24, 24, 27, 0.04)" }} isAnimationActive={false} />
          {showLimit ? (
            <ReferenceLine
              y={limit}
              stroke={VIZ.axis}
              strokeWidth={1}
              strokeOpacity={0.6}
              label={{ value: limitLabel, position: "insideBottomRight", fontSize: 11, fill: VIZ.axis }}
            />
          ) : null}
          <Bar dataKey="value" name={valueLabel} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.muted ? VIZ.context : VIZ.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
