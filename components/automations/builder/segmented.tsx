"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: React.ComponentType<{ className?: string }> };

/** Tabs-styled radio group for short, mutually exclusive choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex h-9 w-full items-center rounded-lg bg-muted p-1 text-muted-foreground", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
