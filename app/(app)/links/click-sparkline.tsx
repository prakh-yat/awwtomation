"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

import { TONE_HEX } from "@/components/ui/tone";
import type { LinkClickPoint } from "@/lib/services/links";
import { formatNumber } from "@/lib/utils";

import { formatDayKey } from "./format";

// Clicks are a chart series, so they take the brand purple.
const SERIES = TONE_HEX.purple;

function SparkTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-xl border bg-background px-3 py-2 text-xs shadow-elevated">
      <p className="font-semibold">{typeof label === "string" ? formatDayKey(label) : ""}</p>
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

/** Daily clicks as a flat purple area: no axes, the two date captions underneath are enough context. */
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
            <Tooltip content={SparkTooltip} cursor={{ stroke: SERIES, strokeOpacity: 0.3, strokeWidth: 1 }} isAnimationActive={false} />
            <Area
              type="monotone"
              dataKey="clicks"
              stroke={SERIES}
              strokeWidth={2}
              fill={SERIES}
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0, fill: SERIES }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">No clicks in this period</p>
          </div>
        ) : null}
      </div>
      {first && last ? (
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{formatDayKey(first)}</span>
          <span>{formatDayKey(last)}</span>
        </div>
      ) : null}
    </div>
  );
}
