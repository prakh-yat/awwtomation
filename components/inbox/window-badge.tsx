"use client";

import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WindowState } from "@/lib/services/inbox";

import { timeLeft } from "./format";
import { WINDOW_RULE_EXPLANATION } from "./window-state";

/** "Open · 23h left" / "Human agent · 6d left" / "Closed" with Meta's rule in a tooltip. */
function WindowBadge({ window, now }: { window: WindowState; now: number }) {
  let label: string;
  let variant: "success" | "warning" | "secondary";
  if (window.kind === "standard") {
    label = `Open · ${timeLeft(window.expiresAt, now)}`;
    variant = "success";
  } else if (window.kind === "human_agent") {
    label = `Human agent · ${timeLeft(window.expiresAt, now)}`;
    variant = "warning";
  } else {
    label = "Closed";
    variant = "secondary";
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} className="cursor-default">
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
