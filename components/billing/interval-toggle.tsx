"use client";

import { Segmented } from "@/components/ui/segmented";
import { type BillingIntervalId } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/**
 * Monthly or annual, as the pill switch on the pricing page. Sized to its
 * labels rather than stretched: equal flex columns would clip "save 20%".
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
  /** Shown after "Annual" as "save 20%". */
  savingsPercent?: number;
  className?: string;
  size?: "sm" | "default";
}) {
  return (
    <Segmented<BillingIntervalId>
      value={value}
      onChange={onChange}
      aria-label="Billing interval"
      size={size}
      className={cn("w-auto [&>button]:flex-none [&>button]:px-4", className)}
      options={[
        { value: "MONTHLY", label: "Monthly" },
        { value: "ANNUAL", label: savingsPercent ? `Annual · save ${savingsPercent}%` : "Annual" },
      ]}
    />
  );
}
