"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A small (i) that explains one thing. It opens under the pointer and stays
 * open once clicked, so it also works on a touch screen, where a tooltip never
 * shows. Clicks stop here, so one inside a flow step does not select the step.
 */
export function InfoTip({
  label,
  children,
  side = "top",
  align = "center",
  className,
  iconClassName,
}: {
  /** What the button says to a screen reader, e.g. "What Done means". */
  label: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // Opened by a click: stays until the next click or a click outside.
  const pinned = React.useRef(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(closeTimer.current), []);

  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || pinned.current) return;
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) pinned.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onDoubleClick={stop}
          onClick={(event) => {
            event.stopPropagation();
            // Already open under the pointer: a click keeps it open instead of closing it.
            if (open && !pinned.current) {
              event.preventDefault();
              pinned.current = true;
              return;
            }
            pinned.current = !open;
          }}
          className={cn(
            "nodrag nopan inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-current opacity-55 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:opacity-100",
            className,
          )}
        >
          <Info className={cn("h-3 w-3", iconClassName)} strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={() => clearTimeout(closeTimer.current)}
        onPointerLeave={hoverClose}
        onClick={stop}
        className="w-auto max-w-[16rem] rounded-lg border-0 bg-ink px-3 py-2 text-left text-[12px] font-medium leading-snug text-white"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
