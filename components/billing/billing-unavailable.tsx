import { CreditCard } from "lucide-react";

import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Shown when plans can't be bought right now. Customer-facing: it says what they
 * can do, never why on our side (missing keys, products, config). The detail
 * goes to the server log where whoever runs the deployment will see it.
 */
export function BillingUnavailable({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-2xl bg-fog p-4", className)}>
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-ink">
        <CreditCard className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 text-[13px]">
        <p className="font-semibold text-ink">Plan changes are unavailable right now</p>
        <p className="mt-0.5 text-muted-foreground">
          Your current plan keeps working. To upgrade in the meantime, email{" "}
          <a href={`mailto:${brand.supportEmail}`} className="font-semibold text-ink underline underline-offset-4 hover:no-underline">
            {brand.supportEmail}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
