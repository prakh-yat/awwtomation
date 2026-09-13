import Link from "next/link";

import { cn, formatNumber } from "@/lib/utils";

import { VIZ } from "./tokens";

export type BarListItem = {
  key: string;
  label: React.ReactNode;
  value: number;
  /** Optional secondary figure shown after the value, e.g. "34% CTR". */
  meta?: string;
  href?: string;
};

/**
 * Ranked list with a slim bar under each label — for "which ones did the most".
 * Every value is printed, so the bar only has to show proportion; one series,
 * one colour.
 */
export function BarList({
  items,
  className,
  emptyLabel = "Nothing to show yet",
  valueLabel,
}: {
  items: BarListItem[];
  className?: string;
  emptyLabel?: string;
  /** Screen-reader noun for the value, e.g. "DMs sent". */
  valueLabel?: string;
}) {
  if (items.length === 0) {
    return <p className={cn("py-6 text-center text-[13px] text-muted-foreground", className)}>{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className={cn("space-y-3.5", className)}>
      {items.map((item) => {
        const width = `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%`;
        const label = item.href ? (
          <Link href={item.href} className="truncate underline-offset-4 hover:underline">
            {item.label}
          </Link>
        ) : (
          <span className="truncate">{item.label}</span>
        );
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center">{label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium">{formatNumber(item.value)}</span>
                {valueLabel ? <span className="sr-only"> {valueLabel}</span> : null}
                {item.meta ? <span className="ml-2 text-muted-foreground">{item.meta}</span> : null}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full" style={{ width, backgroundColor: VIZ.accent }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
