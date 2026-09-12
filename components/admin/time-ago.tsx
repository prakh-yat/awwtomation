import { cn } from "@/lib/utils";

import { formatRelative, formatUtc } from "./format";

/**
 * Relative time with the absolute UTC timestamp on hover. The relative text
 * drifts between server render and hydration by design, hence the
 * suppressed warning.
 */
export function TimeAgo({ iso, className }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <time dateTime={iso} title={formatUtc(iso)} suppressHydrationWarning className={cn("whitespace-nowrap tabular-nums", className)}>
      {formatRelative(iso)}
    </time>
  );
}
