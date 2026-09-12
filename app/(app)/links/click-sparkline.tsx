"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

import type { LinkClickPoint } from "@/lib/services/links";
import { formatNumber } from "@/lib/utils";

import { formatDayKey } from "./format";

// Monochrome, matching the tokens in globals.css.
const INK = "hsl(0 0% 4%)";
const GRID = "hsl(0 0% 90%)";

function SparkTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-elevated">
      <p className="font-medium">{typeof label === "string" ? formatDayKey(label) : ""}</p>
      <p className="text-muted-foreground">
        {formatNumber(value)} {value === 1 ? "click" : "clicks"}
      </p>
    </div>
  );
}

export interface ClickSparklineProps {
  data: LinkClickPoint[];
  height?: number;
}

/** Daily clicks as a flat black area — no axes, the two date captions underneath are enough context. */
export function ClickSparkline({ data, height = 120 }: ClickSparklineProps) {
  const empty = data.every((p) => p.clicks === 0);
  const first = data[0]?.date;
  const last = data[data.length - 1]?.date;

  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]} allowDecimals={false} />
            <Tooltip content={SparkTooltip} cursor={{ stroke: GRID, strokeWidth: 1 }} isAnimationActive={false} />
            <Area
              type="monotone"
              dataKey="clicks"
              stroke={INK}
              strokeWidth={1.5}
              fill={INK}
              fillOpacity={0.08}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: INK }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-card">No clicks in this period</p>
          </div>
        ) : null}
      </div>
      {first && last ? (
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{formatDayKey(first)}</span>
          <span>{formatDayKey(last)}</span>
        </div>
      ) : null}
    </div>
  );
}
