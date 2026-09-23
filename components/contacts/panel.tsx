import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A card on the contact page: a mono eyebrow where a title and paragraph
 * would be, an optional action on the same line, then the content.
 */
export function Panel({ label, action, children, className }: { label: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5", className)}>
      <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
        <h2 className="brand-label text-muted-foreground">{label}</h2>
        {action ? <div className="-my-1 flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
