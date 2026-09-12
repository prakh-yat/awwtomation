import Link from "next/link";
import { ChevronRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface CursorPaginationProps {
  shown: number;
  total: number;
  noun: string;
  /** Link to the next page, or null on the last page. */
  nextHref: string | null;
  /** Link back to the first page; shown only while paging. */
  resetHref?: string;
  isPaged?: boolean;
}

/** Link-based cursor pagination so server-rendered tables need no client state. */
export function CursorPagination({ shown, total, noun, nextHref, resetHref, isPaged = false }: CursorPaginationProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5 text-xs text-muted-foreground">
      <span className="tabular-nums">
        Showing {shown} of {total} {noun}
      </span>
      <div className="flex items-center gap-2">
        {isPaged && resetHref ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={resetHref}>
              <RotateCcw />
              First page
            </Link>
          </Button>
        ) : null}
        {nextHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={nextHref}>
              Next
              <ChevronRight />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
