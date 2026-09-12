"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TechnicalDetailsProps {
  /** The raw message / code line. Rendered verbatim, so only pass it for ADMIN+ viewers. */
  hint: string | null | undefined;
  /** Optional pretty-printed JSON (Meta's response). Super-admin only by convention. */
  json?: string | null;
  className?: string;
  /** Slightly denser variant for table cells and cards. */
  compact?: boolean;
}

/**
 * Collapsed-by-default disclosure for the technical side of an error. The
 * caller decides *whether* to render it (role gating happens in the server
 * component that knows the viewer's role); this component only decides how.
 * Uses a native <details> so it needs no state and works without JS.
 */
export function TechnicalDetails({ hint, json, className, compact = false }: TechnicalDetailsProps) {
  if (!hint && !json) return null;
  return (
    <details className={cn("group min-w-0", className)} onClick={(e) => e.stopPropagation()}>
      <summary
        className={cn(
          "inline-flex cursor-pointer select-none list-none items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden",
          compact ? "text-[11px]" : "text-xs",
        )}
      >
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden />
        Technical details
      </summary>
      <div className="mt-1.5 space-y-1.5">
        {hint ? (
          <p className={cn("whitespace-pre-wrap break-words rounded-md border bg-background px-2.5 py-1.5 font-mono text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {hint}
          </p>
        ) : null}
        {json ? (
          <pre className="max-h-64 overflow-auto rounded-md border bg-background p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
            {json}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
