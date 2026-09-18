"use client";

import * as React from "react";

import { cn, formatNumber } from "@/lib/utils";

import { HEAT_RAMP } from "./tokens";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/** "Nepal Time" rather than "Asia/Kathmandu"; falls back to the id if the runtime has no name for it. */
function zoneName(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function hourRange(h: number): string {
  const fmt = (x: number) => `${String(x % 24).padStart(2, "0")}:00`;
  return `${fmt(h)}–${fmt(h + 1)}`;
}

/**
 * When people engage, as a week × hour grid. One hue, light to dark: nothing
 * is lighter than "none", so an empty slot recedes into the page. Each cell is
 * its own hover and focus target; the busiest slot is called out in words below.
 */
export function Heatmap({
  grid,
  unit,
  timezone,
  className,
}: {
  /** 7 rows (Sunday first) × 24 columns. */
  grid: number[][];
  /** Singular noun for the tooltip, e.g. "comment". */
  unit: string;
  timezone: string;
  className?: string;
}) {
  const [active, setActive] = React.useState<{ d: number; h: number } | null>(null);
  const max = Math.max(0, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);

  let peak = { d: 0, h: 0, v: 0 };
  grid.forEach((row, d) => row.forEach((v, h) => v > peak.v && (peak = { d, h, v })));

  const step = (v: number) => (v <= 0 || max === 0 ? 0 : Math.min(HEAT_RAMP.length - 1, 1 + Math.floor((v / max) * (HEAT_RAMP.length - 1 - 0.0001))));
  const plural = (n: number) => `${formatNumber(n)} ${n === 1 ? unit : `${unit}s`}`;

  const current = active ? grid[active.d]?.[active.h] ?? 0 : null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[2px]">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center text-[10px] text-muted-foreground">
                {h % 3 === 0 ? hourLabel(h) : ""}
              </span>
            ))}
            {grid.map((row, d) => (
              <React.Fragment key={d}>
                <span className="flex items-center text-[11px] text-muted-foreground">{DAY_LABELS[d]}</span>
                {row.map((v, h) => {
                  const isActive = active?.d === d && active.h === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-label={`${DAY_NAMES[d]} ${hourRange(h)}: ${plural(v)}`}
                      onMouseEnter={() => setActive({ d, h })}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive({ d, h })}
                      onBlur={() => setActive(null)}
                      className={cn(
                        "aspect-square w-full rounded-[3px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
                        isActive && "ring-2 ring-foreground/70",
                      )}
                      style={{ backgroundColor: HEAT_RAMP[step(v)] }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite" className="min-h-[1rem]">
          {active && current !== null ? (
            <>
              <span className="font-medium text-foreground">{plural(current)}</span> · {DAY_NAMES[active.d]} {hourRange(active.h)}
            </>
          ) : total > 0 ? (
            <>
              Busiest: <span className="font-medium text-foreground">{DAY_NAMES[peak.d]}s, {hourRange(peak.h)}</span> ({plural(peak.v)}) · {zoneName(timezone)}
            </>
          ) : (
            `No activity in this range · ${zoneName(timezone)}`
          )}
        </p>
        <span className="flex items-center gap-1.5">
          Less
          {HEAT_RAMP.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: c }} aria-hidden />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
