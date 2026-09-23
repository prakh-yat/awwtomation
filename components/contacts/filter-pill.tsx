import { cn } from "@/lib/utils";

/**
 * Toolbar triggers are pills. One that is narrowing the list turns the
 * section's green, so what is filtering the view reads at a glance.
 */
export function filterPill(active: boolean): string {
  return cn(
    "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold",
    active ? "border-green/35 bg-green-soft text-green-ink hover:border-green/60 hover:bg-green-soft" : "[&_svg]:text-muted-foreground",
  );
}

/** How many values a filter pill holds. */
export function PillCount({ count }: { count: number }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-green px-1 text-[11px] font-semibold leading-none tabular-nums text-white">
      {count}
    </span>
  );
}
