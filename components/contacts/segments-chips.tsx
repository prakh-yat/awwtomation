import Link from "next/link";
import { Layers } from "lucide-react";

import type { SegmentMatch } from "@/lib/services/segments";
import { cn } from "@/lib/utils";

export interface SegmentChipsProps {
  segments: SegmentMatch[];
  /** True when the workspace has more segments than the service evaluated (it caps the check). */
  truncated?: boolean;
  className?: string;
}

/** Which saved segments a contact currently matches: each chip opens that segment on the contacts page. */
function SegmentChips({ segments, truncated = false, className }: SegmentChipsProps) {
  if (segments.length === 0) {
    return <span className={cn("text-[13px] text-muted-foreground", className)}>Not in any segment</span>;
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {segments.map((s) => (
        <Link
          key={s.id}
          href={`/contacts?segment=${encodeURIComponent(s.id)}`}
          title={`Open “${s.name}”`}
          className="inline-flex h-7 max-w-[12rem] items-center gap-1.5 rounded-full border border-ink/10 bg-background px-2.5 text-[12px] font-semibold outline-none transition-colors hover:border-ink/30 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Layers className="h-3 w-3 shrink-0 text-green-ink" aria-hidden />
          <span className="min-w-0 truncate">{s.name}</span>
        </Link>
      ))}
      {truncated ? <span className="text-[11px] text-muted-foreground">First 20 segments checked</span> : null}
    </div>
  );
}

export { SegmentChips };
