import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one thing every broadcast user must understand: Meta's 24-hour rule.
 * Kept plain (no colour) so it reads as a fact, not a warning.
 */
function WindowCallout({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3", className)} role="note">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-foreground" strokeWidth={1.75} />
      <div className="text-[13px] leading-relaxed">
        <p className="font-medium text-foreground">Only contacts inside the 24-hour window receive a broadcast.</p>
        <p className="text-muted-foreground">
          Meta allows businesses to message people only within 24 hours of their last message to you. A broadcast goes to
          everyone in your audience whose window is open at send time
          {compact ? "; everyone else is skipped and logged." : " — everyone else is counted as skipped (outside 24h window) and logged, never messaged."}
        </p>
      </div>
    </div>
  );
}

export { WindowCallout };
