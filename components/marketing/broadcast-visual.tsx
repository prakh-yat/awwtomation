import * as React from "react";
import { CalendarClock, Send } from "lucide-react";

import { PlatformIcon } from "@/components/ui/platform-icon";
import { cn } from "@/lib/utils";

import { Chip, Panel } from "./mock-parts";

const AUDIENCE = 412;
const ELIGIBLE = 38;

/** A broadcast being set up: tagged audience, how many are inside the 24-hour window, the message. */
function BroadcastVisual({ className }: { className?: string }) {
  return (
    <Panel
      role="img"
      aria-label={`A new broadcast to contacts tagged autumn-collection. ${ELIGIBLE} of ${AUDIENCE} contacts can receive it now; the rest are outside the 24-hour window and will be skipped.`}
      className={className}
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <p className="text-[13px] font-semibold">New broadcast</p>
        <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <PlatformIcon platform="INSTAGRAM" size={12} />
          @himalayanthreads
        </p>
      </div>

      <div className="space-y-5 px-5 pb-5 pt-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium">Audience</p>
            <p className="text-[12px] text-muted-foreground">{AUDIENCE} contacts</p>
          </div>
          <div className="mt-2 flex h-9 items-center gap-2 rounded-md border px-2.5 text-[12px] text-muted-foreground">
            Tagged
            <Chip>autumn-collection</Chip>
          </div>

          <div className="mt-3 rounded-lg border bg-muted/40 px-4 py-3.5">
            <p className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">{ELIGIBLE}</span>
              <span className="text-[13px]">can receive it now</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-foreground" style={{ width: `${(ELIGIBLE / AUDIENCE) * 100}%` }} />
            </div>
            <p className="mt-2.5 text-[12px] leading-[1.5] text-muted-foreground">
              {AUDIENCE - ELIGIBLE} haven’t messaged you in the last 24 hours, so they’ll be skipped. The count is checked again at send time.
            </p>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium">Message</p>
          <p className="mt-2 rounded-md border px-3.5 py-3 text-[13px] leading-[1.5]">
            Namaste <span className="rounded bg-muted px-1 font-mono text-[11.5px]">{"{{first_name}}"}</span>! The rust
            kurta is back in M and L. Reply here and we’ll keep one aside for you.
          </p>
        </div>

        <div className={cn("flex flex-wrap items-center gap-2")}>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background">
            <Send aria-hidden className="size-3.5" strokeWidth={2} />
            Send to {ELIGIBLE} people
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium">
            <CalendarClock aria-hidden className="size-3.5" strokeWidth={2} />
            Schedule for later
          </span>
        </div>
      </div>
    </Panel>
  );
}

export { BroadcastVisual };
