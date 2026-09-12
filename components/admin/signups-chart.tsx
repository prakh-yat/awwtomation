"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { shortDate } from "./format";

type Point = { date: string; count: number };
type Row = Point & { label: string };

type ChartTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Row }>;
};

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-elevated">
      <p className="text-muted-foreground">{row.date}</p>
      <p className="font-medium tabular-nums">
        {row.count} signup{row.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Monochrome daily bar chart. Colors are literal HSL matching the design tokens because SVG can't read CSS vars through recharts props. */
export function SignupsChart({ data }: { data: Point[] }) {
  const rows: Row[] = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="relative h-56 w-full">
      {total === 0 ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No signups in the last 30 days
        </p>
      ) : null}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 0, left: -16, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="hsl(0 0% 92%)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={4}
            dy={4}
            tick={{ fontSize: 11, fill: "hsl(0 0% 42%)" }}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11, fill: "hsl(0 0% 42%)" }} />
          <Tooltip cursor={{ fill: "hsl(0 0% 96%)" }} content={<ChartTooltip />} />
          <Bar dataKey="count" fill="hsl(0 0% 4%)" radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
