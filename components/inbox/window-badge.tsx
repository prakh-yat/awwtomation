"use client";

import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WindowState } from "@/lib/services/inbox";

import { timeLeft } from "./format";
import { WINDOW_RULE_EXPLANATION } from "./window-state";

/**
 * How long you can still reply: "23h left", then "6d left" once only a person
 * on the team may answer, then "Can't reply". The rule itself is in the tooltip.
 * It avoids "Open" and "Closed", which already describe the conversation.
 */
function WindowBadge({ window, now }: { window: WindowState; now: number }) {
  let label: string;
  let variant: "success" | "warning" | "secondary";
  if (window.kind === "standard") {
    label = timeLeft(window.expiresAt, now);
    variant = "success";
  } else if (window.kind === "human_agent") {
    label = `${timeLeft(window.expiresAt, now)}, team only`;
    variant = "warning";
  } else {
    label = "Can't reply";
    variant = "secondary";
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} className="shrink-0 cursor-default whitespace-nowrap">
          <Clock className="h-3 w-3" aria-hidden />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
        {WINDOW_RULE_EXPLANATION}
      </TooltipContent>
    </Tooltip>
  );
}

export { WindowBadge };
