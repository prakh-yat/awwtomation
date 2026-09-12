import { cn, formatNumber } from "@/lib/utils";

export type UsageRow = {
  label: string;
  used: number;
  limit: number;
  /** Small muted note under the bar, e.g. "Resets Oct 1". */
  hint?: string;
};

/**
 * Bars stay black until a quota is nearly gone: warning at 80%, destructive
 * at 100%. Those are the only two colours the design system allows here.
 */
function tone(ratio: number): string {
  if (ratio >= 1) return "bg-destructive";
  if (ratio >= 0.8) return "bg-warning";
  return "bg-foreground";
}

export function UsageBars({ rows, className }: { rows: UsageRow[]; className?: string }) {
  return (
    <dl className={cn("grid gap-5 sm:grid-cols-2", className)}>
      {rows.map((row) => {
        const ratio = row.limit > 0 ? row.used / row.limit : 0;
        const width = `${Math.min(100, Math.round(ratio * 100))}%`;
        return (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] font-medium">{row.label}</dt>
              <dd className="text-[13px] tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{formatNumber(row.used)}</span> / {formatNumber(row.limit)}
              </dd>
            </div>
            <div
              role="progressbar"
              aria-label={`${row.label} usage`}
              aria-valuemin={0}
              aria-valuemax={row.limit}
              aria-valuenow={Math.min(row.used, row.limit)}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className={cn("h-full rounded-full transition-[width]", tone(ratio))} style={{ width }} />
            </div>
            {row.hint ? <p className="mt-1.5 text-xs text-muted-foreground">{row.hint}</p> : null}
          </div>
        );
      })}
    </dl>
  );
}
