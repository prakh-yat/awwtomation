"use client";

import { CircleHelp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { STATUS_HELP, STATUS_ORDER, STATUS_SHORT_LABELS, statusVariant } from "./labels";

/** One line per status, so a skipped message never needs a manual. */
export function SkipHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
          <CircleHelp />
          Why not sent?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-2rem)] p-0">
        <p className="brand-label border-b px-4 py-3 text-muted-foreground">What each status means</p>
        <ul className="max-h-[60vh] divide-y overflow-y-auto scrollbar-thin">
          {STATUS_ORDER.map((status) => (
            <li key={status} className="flex flex-col items-start gap-1.5 px-4 py-2.5">
              <Badge variant={statusVariant(status)}>{STATUS_SHORT_LABELS[status]}</Badge>
              <p className="text-[12px] leading-snug text-muted-foreground">{STATUS_HELP[status]}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
