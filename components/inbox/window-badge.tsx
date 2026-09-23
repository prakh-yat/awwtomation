"use client";

import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { WindowState } from "@/lib/services/inbox";
import { cn } from "@/lib/utils";

import { untilLabel } from "./format";
import { teamReplyDeadline } from "./window-state";

/** With less than this left the pill turns orange and pulses. */
const CLOSING_SOON_MS = 2 * 3600 * 1000;

/**
 * How long you can still reply, as one compact pill: "Replies open until
 * Tue 4:12 pm", orange once it is nearly up, "Replies closed" after that.
 * The deadline is the one that applies to a person replying from here.
 */
function WindowBadge({ window, now, className }: { window: WindowState; now: number; className?: string }) {
  const deadline = teamReplyDeadline(window);
  if (!deadline) {
    return (
      <Badge variant="secondary" className={cn("shrink-0", className)}>
        <Clock aria-hidden />
        Replies closed
      </Badge>
    );
  }

  const closingSoon = new Date(deadline).getTime() - now < CLOSING_SOON_MS;
  return (
    // Allowed to shrink on narrow screens: the label truncates, the leading dot keeps its size.
    <Badge
      variant={closingSoon ? "warning" : "success"}
      dot={closingSoon ? "pulse" : true}
      className={cn("min-w-0 [&>span:first-child]:shrink-0", className)}
    >
      <span className="truncate">
        <span className="hidden sm:inline">Replies open</span>
        <span className="sm:hidden">Open</span> until {untilLabel(deadline, now)}
      </span>
    </Badge>
  );
}

export { WindowBadge };
