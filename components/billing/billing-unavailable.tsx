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
    <div className={cn("flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3.5", className)}>
      <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="min-w-0 text-[13px]">
        <p className="font-medium text-foreground">Plan changes are unavailable right now</p>
        <p className="mt-0.5 text-muted-foreground">
          Your current plan keeps working. To upgrade in the meantime, email{" "}
          <a href={`mailto:${brand.supportEmail}`} className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
            {brand.supportEmail}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
