import { stagger } from "@/components/charts/stagger";
import { Delta } from "@/components/ui/delta";
import { Stat } from "@/components/ui/stat";
import type { Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export type Kpi = {
  key: string;
  label: string;
  /** Pre-formatted figure. */
  value: string;
  delta?: number | string | null;
  upIsGood?: boolean;
};

/**
 * Column counts per strip length. An odd strip gives its last number the full
 * row on a phone rather than leaving a hole beside it.
 */
const LAYOUT: Record<number, { grid: string; lastOdd: string }> = {
  3: { grid: "grid-cols-2 md:grid-cols-3", lastOdd: "col-span-2 md:col-span-1" },
  4: { grid: "grid-cols-2 lg:grid-cols-4", lastOdd: "" },
  5: { grid: "grid-cols-2 lg:grid-cols-5", lastOdd: "col-span-2 lg:col-span-1" },
  6: { grid: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6", lastOdd: "" },
};

/**
 * The headline numbers of a report, each with its change against the previous
 * period. One of them, the number the page wants read first, is a filled block
 * in the section's colour; the rest are plain.
 */
export function KpiStrip({
  items,
  highlight,
  tone,
  compact = false,
  className,
}: {
  items: Kpi[];
  /** Key of the number to fill. Leave it out when something else on the page already is the filled block. */
  highlight?: string;
  tone: Tone;
  /** Shorter blocks, for a page that has to fit on one screen. */
  compact?: boolean;
  className?: string;
}) {
  const layout = LAYOUT[items.length] ?? LAYOUT[4];
  return (
    <div className={cn("grid gap-3", layout.grid, className)}>
      {items.map((item, i) => {
        const filled = item.key === highlight;
        const last = i === items.length - 1 && items.length % 2 === 1;
        return (
          <div key={item.key} className={cn("rise", last && layout.lastOdd)} style={stagger(i)}>
            <Stat
              label={item.label}
              value={item.value}
              tone={filled ? tone : "plain"}
              // Green and red text disappear on a coloured block, so there the
              // change takes the block's own text colour; the arrow still says which way.
              meta={<Delta value={item.delta} upIsGood={item.upIsGood} className={filled ? "text-current" : undefined} />}
              className={cn("h-full", compact ? "gap-3 p-4 [&_[data-stat-value]]:text-[30px]" : "p-4 sm:p-5")}
            />
          </div>
        );
      })}
    </div>
  );
}
