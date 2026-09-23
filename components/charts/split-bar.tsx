import { seriesColor } from "./tokens";

export type SplitSegment = {
  key: string;
  label: string;
  /** Share of the whole, 0 to 1. */
  share: number;
};

function pct(share: number): string {
  if (share > 0 && share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/**
 * A whole split into parts: one bar with a 2px surface gap between segments
 * and a legend that prints every share, so the colours only carry identity.
 * Segments take the categorical series in order, whatever their size.
 */
export function SplitBar({ segments, label, className }: { segments: SplitSegment[]; label: string; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-fog" aria-hidden>
        {segments.map((s, i) =>
          s.share > 0 ? (
            <span key={s.key} className="h-full min-w-[4px]" style={{ flexGrow: s.share, flexBasis: 0, backgroundColor: seriesColor(i) }} />
          ) : null,
        )}
      </div>
      <ul aria-label={label} className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
        {segments.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: seriesColor(i) }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums">{pct(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
