import Link from "next/link";

import { cn, formatNumber } from "@/lib/utils";

export type BreakdownItem = {
  key: string;
  label: React.ReactNode;
  value: number;
  href?: string;
};

/**
 * "Which sent the most" on the usage page. Every value is printed, so the bar
 * only shows proportion, in the same purple as the DM meter and history.
 */
export function UsageBreakdown({
  items,
  emptyLabel = "No DMs sent this month",
  valueLabel = "DMs",
  className,
}: {
  items: BreakdownItem[];
  emptyLabel?: string;
  /** Screen-reader noun for the value. */
  valueLabel?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p className={cn("flex h-28 items-center justify-center rounded-xl border border-dashed px-4 text-center text-[13px] text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className={cn("space-y-4", className)}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            {item.href ? (
              <Link href={item.href} className="min-w-0 truncate underline-offset-4 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="flex min-w-0 items-center">{item.label}</span>
            )}
            <span className="shrink-0 font-semibold tabular-nums">
              {formatNumber(item.value)}
              <span className="sr-only"> {valueLabel}</span>
            </span>
          </div>
          <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className="h-full origin-left animate-bar-grow rounded-full bg-purple motion-reduce:animate-none"
              style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
