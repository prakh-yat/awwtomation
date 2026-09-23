import { cn, formatNumber } from "@/lib/utils";

export type UsageColumn = {
  key: string;
  label: string;
  value: number;
  /** The month in progress, drawn lighter so a part month doesn't read as a drop. */
  current?: boolean;
};

/**
 * Monthly DMs as purple columns with the count printed on each, so there is
 * no axis or tooltip to read. The table under it carries the same numbers, so
 * the drawing is hidden from screen readers.
 */
export function UsageHistoryChart({
  data,
  limit,
  height = 200,
  className,
}: {
  data: UsageColumn[];
  limit?: number;
  height?: number;
  className?: string;
}) {
  const dataMax = Math.max(0, ...data.map((d) => d.value));
  // A limit far above anything sent would flatten every column, so it only shows once usage gets within sight of it.
  const limitLine = limit && dataMax >= limit * 0.25 ? limit : null;
  // Headroom above the tallest column for its printed count.
  const top = Math.max(limitLine ?? 0, dataMax, 1) * 1.2;

  return (
    <div aria-hidden className={cn("select-none", className)}>
      <div className="relative" style={{ height }}>
        {dataMax === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground">No DMs sent yet</p>
        ) : null}
        {limitLine ? (
          <div className="absolute inset-x-0 border-t border-dashed border-ink/25" style={{ bottom: `${(limitLine / top) * 100}%` }}>
            <span className="brand-label absolute -top-2 right-0 z-10 bg-card pl-2 text-muted-foreground">Limit {formatNumber(limitLine)}</span>
          </div>
        ) : null}
        <div className="absolute inset-0 flex items-end gap-3 sm:gap-6">
          {data.map((d, i) => (
            <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className={cn("mb-1.5 text-[12px] font-semibold tabular-nums", d.value === 0 && "text-muted-foreground")}>{formatNumber(d.value)}</span>
              <div
                className={cn("rise w-full max-w-12 rounded-t-lg", d.current ? "bg-purple/45" : "bg-purple")}
                style={{ height: `${d.value > 0 ? Math.max((d.value / top) * 100, 1.5) : 0}%`, "--i": i } as React.CSSProperties}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-3 border-t pt-2.5 sm:gap-6">
        {data.map((d) => (
          <span key={d.key} className={cn("brand-label min-w-0 flex-1 truncate text-center", d.current ? "text-ink" : "text-muted-foreground")}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
