"use client";

import { format, parseISO } from "date-fns";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

import type { SeriesPoint } from "@/lib/services/analytics";
import { formatNumber } from "@/lib/utils";

// Monochrome palette pulled from the design tokens in globals.css.
const INK = "hsl(0 0% 4%)";
const GRAY = "hsl(0 0% 55%)";
const GRID = "hsl(0 0% 90%)";
const TICK = "hsl(0 0% 42%)";

function formatDay(value: unknown, pattern: string): string {
  if (typeof value !== "string") return "";
  try {
    return format(parseISO(value), pattern);
  } catch {
    return value;
  }
}

// Default generics keep this assignable to recharts' `content` prop; values are numbers at runtime.
function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-[150px] rounded-md border bg-background px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1.5 font-medium">{formatDay(label, "EEE, MMM d")}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color ?? INK }} aria-hidden />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums text-foreground">{formatNumber(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface OverviewChartProps {
  data: SeriesPoint[];
  height?: number;
}

/** "DMs sent vs triggers" area/line chart. Black area = sent, dashed gray = triggers. */
export function OverviewChart({ data, height = 260 }: OverviewChartProps) {
  const empty = data.every((p) => p.sent === 0 && p.triggered === 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: INK }} aria-hidden />
          DMs sent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed" style={{ borderColor: GRAY }} aria-hidden />
          Triggers
        </span>
      </div>

      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dashboard-sent-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INK} stopOpacity={0.1} />
                <stop offset="100%" stopColor={INK} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => formatDay(v, "MMM d")}
              tick={{ fontSize: 11, fill: TICK }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              width={36}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: TICK }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(Number(v))}
            />
            <Tooltip content={ChartTooltip} cursor={{ stroke: GRID, strokeWidth: 1 }} isAnimationActive={false} />
            <Area
              type="monotone"
              dataKey="sent"
              name="DMs sent"
              stroke={INK}
              strokeWidth={1.75}
              fill="url(#dashboard-sent-fill)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: INK }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="triggered"
              name="Triggers"
              stroke={GRAY}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: GRAY }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-card">
              No activity in this period yet
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
