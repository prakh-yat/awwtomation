import { Settings2 } from "lucide-react";

import { brand } from "@/lib/brand";

/**
 * Shown instead of a broken checkout when the Dodo env vars are missing.
 * Written for the operator (the person deploying), not the customer.
 */
export function OperatorNotice({
  configured,
  missingProducts,
  compact = false,
}: {
  configured: boolean;
  missingProducts: readonly string[];
  compact?: boolean;
}) {
  const vars = configured ? missingProducts : ["DODO_SECRET_KEY", "DODO_WEBHOOK_SECRET", ...missingProducts];
  return (
    <div className="rounded-lg border border-dashed bg-muted/40 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
          <Settings2 className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 text-[13px]">
          <p className="font-medium text-foreground">
            {configured ? "Some plans aren't purchasable yet" : "Billing isn't configured yet"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {configured
              ? "Dodo Payments is connected, but product ids are missing for the plans below. Run the products script and paste the printed lines into your environment."
              : `Self-serve checkout needs a Dodo Payments API key. Add the variables below to the ${brand.name} environment, then restart the app. See docs/BILLING.md for the full walkthrough.`}
          </p>
          {!compact ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {vars.map((name) => (
                <li key={name}>
                  <code className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px]">{name}</code>
                </li>
              ))}
            </ul>
          ) : null}
          {!configured ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">node --env-file=.env scripts/create-dodo-products.mjs</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
