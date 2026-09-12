"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { AnalyticsPoint } from "@/lib/services/automations";

const SERIES: Array<{ key: keyof Omit<AnalyticsPoint, "date">; label: string; stroke: string; dash?: string; width: number }> = [
  { key: "sent", label: "DMs sent", stroke: "#0a0a0a", width: 2 },
  { key: "triggered", label: "Triggered", stroke: "#737373", width: 1.5 },
  { key: "clicks", label: "Link clicks", stroke: "#0a0a0a", dash: "4 3", width: 1.25 },
  { key: "failed", label: "Failed / skipped", stroke: "#a3a3a3", dash: "2 3", width: 1.25 },
];

type TooltipPayload = { dataKey?: string | number; value?: number | string };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string | number }) {
  if (!active || !payload?.length || typeof label !== "string") return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-[12px] shadow-elevated">
      <p className="mb-1 font-medium">{format(parseISO(label), "EEE, MMM d")}</p>
      {SERIES.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        return (
          <div key={s.key} className="flex items-center justify-between gap-6 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3" style={{ background: s.stroke }} aria-hidden />
              {s.label}
            </span>
            <span className="tabular-nums text-foreground">{entry?.value ?? 0}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Monochrome daily line chart: black primary, grays for context, hairline grid. */
export function AnalyticsChart({ series }: { series: AnalyticsPoint[] }) {
  const step = Math.max(1, Math.ceil(series.length / 8));
  return (
    <div className="space-y-3">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#e5e5e5" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: "#e5e5e5" }}
              tick={{ fontSize: 11, fill: "#737373" }}
              interval={step - 1}
              tickFormatter={(v: string) => format(parseISO(v), "MMM d")}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#737373" }} allowDecimals={false} width={48} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#d4d4d4", strokeWidth: 1 }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.stroke}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                dot={false}
                activeDot={{ r: 3, fill: s.stroke, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
