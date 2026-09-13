import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one rule every broadcast depends on: Instagram and Facebook only let a
 * business message people within 24 hours of their last message. Plain, not
 * coloured, so it reads as a fact rather than a warning.
 */
function WindowCallout({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3", className)} role="note">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-foreground" strokeWidth={1.75} />
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Broadcasts only reach people who messaged you in the last 24 hours.</span> That&apos;s an
        Instagram and Facebook rule. Everyone else in the audience is skipped, and you can see who in the report.
      </p>
    </div>
  );
}

export { WindowCallout };
