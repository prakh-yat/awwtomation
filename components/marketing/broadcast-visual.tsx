import * as React from "react";
import { CalendarClock, Send } from "lucide-react";

import { PlatformIcon } from "@/components/ui/platform-icon";

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
        <p className="inline-flex min-w-0 items-center gap-1.5 truncate text-[12px] text-muted-foreground">
          <PlatformIcon platform="INSTAGRAM" size={12} className="text-magenta-ink" />
          @himalayanthreads
        </p>
      </div>

      <div className="space-y-5 px-5 pb-5 pt-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold">Audience</p>
            <p className="text-[12px] text-muted-foreground">{AUDIENCE} contacts</p>
          </div>
          <div className="mt-2 flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] text-muted-foreground">
            Tagged
            <Chip>autumn-collection</Chip>
          </div>

          <div className="mt-3 rounded-2xl bg-orange-soft px-4 py-3.5">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[30px] leading-none tabular-nums">{ELIGIBLE}</span>
              <span className="text-[13px] font-semibold">can receive it now</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-orange" style={{ width: `${(ELIGIBLE / AUDIENCE) * 100}%` }} />
            </div>
            <p className="mt-2.5 text-[12px] leading-[1.5] text-ink/70">
              {AUDIENCE - ELIGIBLE} haven’t messaged you in the last 24 hours, so they’ll be skipped. The count is checked again at send time.
            </p>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-semibold">Message</p>
          <p className="mt-2 rounded-2xl border px-3.5 py-3 text-[13px] leading-[1.5]">
            Namaste <span className="rounded bg-fog px-1 font-mono text-[11.5px]">{"{{first_name}}"}</span>, the rust
            kurta is back in M and L. Reply here and we’ll keep one aside for you.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12px] font-semibold text-white">
            <Send aria-hidden className="size-3.5" strokeWidth={2} />
            Send to {ELIGIBLE} people
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold">
            <CalendarClock aria-hidden className="size-3.5" strokeWidth={2} />
            Schedule for later
          </span>
        </div>
      </div>
    </Panel>
  );
}

export { BroadcastVisual };
