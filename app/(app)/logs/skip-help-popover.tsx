"use client";

import { CircleHelp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { STATUS_HELP, STATUS_ORDER, STATUS_SHORT_LABELS, statusVariant } from "./labels";

/** One-paragraph explanation per outcome, so nobody has to read the Meta docs to understand a skip. */
export function SkipHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
          <CircleHelp />
          Why skipped?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Delivery outcomes</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Skips are the platform obeying Meta&apos;s messaging rules, not errors. Failures are responses from Meta.
          </p>
        </div>
        <ul className="max-h-[60vh] divide-y overflow-y-auto scrollbar-thin">
          {STATUS_ORDER.map((status) => (
            <li key={status} className="px-4 py-3">
              <Badge variant={statusVariant(status)}>{STATUS_SHORT_LABELS[status]}</Badge>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{STATUS_HELP[status]}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
