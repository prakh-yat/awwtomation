import Link from "next/link";
import { Layers } from "lucide-react";

import { badgeVariants } from "@/components/ui/badge";
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
    return <span className={cn("text-muted-foreground", className)}>Not in any segment</span>;
  }
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-1", className)}>
      {segments.map((s) => (
        <Link
          key={s.id}
          href={`/contacts?segment=${encodeURIComponent(s.id)}`}
          title={`Open “${s.name}”`}
          className={cn(badgeVariants({ variant: "outline" }), "max-w-[12rem] font-normal transition-colors hover:bg-accent")}
        >
          <Layers className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{s.name}</span>
        </Link>
      ))}
      {truncated ? <span className="text-[11px] text-muted-foreground">first 20 segments checked</span> : null}
    </div>
  );
}

export { SegmentChips };
