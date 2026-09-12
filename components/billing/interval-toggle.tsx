"use client";

import { type BillingIntervalId } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/**
 * Monthly / Annual segmented control. Pure black-and-white: the selected
 * segment is a white pill on the muted track, matching the tabs pattern.
 */
export function IntervalToggle({
  value,
  onChange,
  savingsPercent,
  className,
  size = "default",
}: {
  value: BillingIntervalId;
  onChange: (next: BillingIntervalId) => void;
  /** Shown next to "Annual" as "save 20%". */
  savingsPercent?: number;
  className?: string;
  size?: "sm" | "default";
}) {
  const options: Array<{ id: BillingIntervalId; label: string }> = [
    { id: "MONTHLY", label: "Monthly" },
    { id: "ANNUAL", label: "Annual" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Billing interval"
      className={cn("inline-flex rounded-md border bg-muted p-0.5", className)}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
            {opt.id === "ANNUAL" && savingsPercent ? (
              <span className={cn("rounded-full px-1.5 text-[10px] font-semibold leading-4", active ? "bg-foreground text-background" : "bg-background text-foreground")}>
                save {savingsPercent}%
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
