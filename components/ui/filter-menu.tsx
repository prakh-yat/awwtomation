"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ListFilter, type LucideIcon } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn, formatNumber } from "@/lib/utils";

export type FilterOption<T extends string> = {
  value: T;
  label: string;
  /** Shown right-aligned; leave out when there is no count to show. */
  count?: number | null;
  /** A colour class for the dot before the label, e.g. `bg-green`. */
  dot?: string;
  /** Shown on hover, e.g. what a saved view filters on. */
  hint?: string;
};

export interface FilterMenuProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<FilterOption<T>>;
  /** The unfiltered choice. Anything else marks the button as active and names the filter on it. */
  defaultValue: T;
  /** Names the menu for screen readers and heads the list. */
  label: string;
  /** Also name the menu on the button while nothing is filtered, for a toolbar where every other control has words. */
  showLabel?: boolean;
  icon?: LucideIcon;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  /** A yellow dot on the button, e.g. a saved view whose filters were changed since. Name it in `markLabel`. */
  marked?: boolean;
  markLabel?: string;
  /** Extra items under the choices, e.g. rename and delete for the one that is active. */
  footer?: React.ReactNode;
  /** Restyles the button, e.g. to match a toolbar's own pills; told whether a filter is on. */
  triggerClassName?: (active: boolean) => string;
  className?: string;
}

/**
 * One button that stands in for a row of filter chips: a filter icon while
 * nothing is filtered, the chosen filter's name once something is. The
 * choices, with their counts, open underneath it.
 */
export function FilterMenu<T extends string>({
  value,
  onChange,
  options,
  defaultValue,
  label,
  showLabel = false,
  icon: Icon = ListFilter,
  disabled,
  align = "end",
  marked = false,
  markLabel = "changed",
  footer,
  triggerClassName,
  className,
}: FilterMenuProps<T>) {
  const current = options.find((o) => o.value === value);
  const active = value !== defaultValue && Boolean(current);
  const iconOnly = !active && !showLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={active && current ? `${label}: ${current.label}` : label}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border text-[13px] font-semibold outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            active
              ? "border-ink bg-ink pl-3 pr-3.5 text-white hover:bg-ink/90"
              : cn("border-input bg-background text-ink hover:border-ink/30 data-[state=open]:border-ink", iconOnly ? "w-9" : "pl-3 pr-3.5"),
            triggerClassName?.(active),
            className,
          )}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          {active && current ? (
            <>
              {current.dot ? <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", current.dot)} /> : null}
              <span className="max-w-[9rem] truncate">{current.label}</span>
              {current.count != null ? <span className="tabular-nums opacity-60">{formatNumber(current.count)}</span> : null}
            </>
          ) : showLabel ? (
            <span className="truncate">{label}</span>
          ) : null}
          {marked ? (
            <>
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow" />
              <span className="sr-only">({markLabel})</span>
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuPrimitive.RadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuPrimitive.RadioItem
              key={option.value}
              value={option.value}
              title={option.hint}
              className="relative flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors focus:bg-fog data-[state=checked]:font-semibold"
            >
              {option.dot ? <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", option.dot)} /> : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.count != null ? <span className="tabular-nums text-muted-foreground">{formatNumber(option.count)}</span> : null}
              <span className="flex w-4 shrink-0 justify-end">
                <DropdownMenuPrimitive.ItemIndicator>
                  <Check className="h-4 w-4 text-purple" strokeWidth={2.5} />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuPrimitive.RadioGroup>
        {footer}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
