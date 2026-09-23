"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: React.ComponentType<{ className?: string }> };

/**
 * A pill radio group for short, mutually exclusive choices. The active option
 * is an ink pill, like the site's monthly/yearly switch; arrow keys move
 * between options.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
  "aria-label"?: string;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex w-full items-center gap-0.5 rounded-full bg-fog p-1 text-muted-foreground", size === "sm" ? "h-8" : "h-10", className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              // No min-w-0: an option never shrinks below its label, so a
              // content-width control (w-auto) cannot truncate.
              "inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-semibold transition-colors duration-150",
              size === "sm" ? "text-[12px]" : "text-[13px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              active ? "bg-ink text-white" : "hover:bg-background hover:text-ink",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
