import { TONES, type Tone } from "@/components/ui/tone";
import { cn, formatNumber } from "@/lib/utils";

export type UsageRow = {
  label: string;
  used: number;
  limit: number;
  /** One short muted line under the meter, e.g. "Resets Oct 1". */
  hint?: string;
  /** The meter's colour: the section the quota counts (accounts yellow, automations purple). */
  tone?: Tone;
};

export type MeterLevel = "ok" | "near" | "full";

/** Orange from 80% of a limit, red once it is reached. */
export function meterLevel(used: number, limit: number): MeterLevel {
  const ratio = limit > 0 ? used / limit : 0;
  if (ratio >= 1) return "full";
  if (ratio >= 0.8) return "near";
  return "ok";
}

export interface MeterProps {
  used: number;
  limit: number;
  /** Accessible name, e.g. "DMs used this month". */
  label: string;
  size?: "default" | "lg";
  /** Fill while there is room left. Near the limit it turns orange, at it red, whatever the tone. */
  tone?: Tone;
  /** Light track and fill, for the ink plan block. */
  dark?: boolean;
  className?: string;
}

/** A quota bar that grows in on load. */
export function Meter({ used, limit, label, size = "default", tone = "ink", dark = false, className }: MeterProps) {
  const level = meterLevel(used, limit);
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0;
  // Any use at all shows a sliver, so 3 of 15,000 doesn't read as none.
  const width = `${Math.max(ratio * 100, used > 0 ? 1.5 : 0)}%`;
  const fill = level === "full" ? "bg-destructive" : level === "near" ? "bg-orange" : dark ? "bg-white" : TONES[tone].dot;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={Math.min(used, limit)}
      aria-valuetext={`${used.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")}`}
      className={cn("w-full overflow-hidden rounded-full", size === "lg" ? "h-3" : "h-1.5", dark ? "bg-white/15" : "bg-ink/[0.08]", className)}
    >
      <div className={cn("h-full origin-left animate-bar-grow rounded-full motion-reduce:animate-none", fill)} style={{ width }} />
    </div>
  );
}

/** Label, count and meter for each quota. `dark` sets them on a dark plan block. */
export function UsageBars({ rows, className, dark = false }: { rows: UsageRow[]; className?: string; dark?: boolean }) {
  return (
    <dl className={cn("grid gap-x-8 gap-y-6 sm:grid-cols-2", className)}>
      {rows.map((row) => {
        const full = meterLevel(row.used, row.limit) === "full";
        return (
          <div key={row.label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
            <dt className={cn("brand-label truncate", dark ? "text-white/60" : "text-muted-foreground")}>{row.label}</dt>
            <dd className={cn("text-[13px] tabular-nums", dark ? "text-white/60" : "text-muted-foreground")}>
              <span className={cn("font-semibold", dark ? "text-white" : full ? "text-destructive" : "text-ink")}>{formatNumber(row.used)}</span> /{" "}
              {formatNumber(row.limit)}
            </dd>
            <dd className="col-span-2 mt-2.5">
              <Meter used={row.used} limit={row.limit} label={`${row.label} usage`} tone={row.tone} dark={dark} />
              {row.hint ? <p className={cn("mt-2 text-xs", dark ? "text-white/50" : "text-muted-foreground")}>{row.hint}</p> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
