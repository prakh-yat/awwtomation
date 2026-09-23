import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { PlanTier } from "@prisma/client";

import { CheckoutClient } from "@/components/billing/checkout-client";
import { BillingUnavailable } from "@/components/billing/billing-unavailable";
import { Button } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { getDodoMode, isBillingConfigured, resolveProductId } from "@/lib/billing/dodo/config";
import { type BillingIntervalId, isBillingInterval, isPlanTier, isPurchasablePlan, PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { getBillingOverview } from "@/lib/services/billing";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

type SearchParams = Promise<{ tier?: string | string[]; interval?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Owner-only, outside the app shell so the payment step gets the whole
 * viewport. Anyone who shouldn't be here is bounced to /settings/billing with
 * a reason instead of seeing an error page.
 */
export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  if (ctx.role !== "OWNER") redirect("/settings/billing?error=owner");

  const params = await searchParams;
  const tierParam = first(params.tier)?.toUpperCase();
  const intervalParam = first(params.interval)?.toUpperCase();
  const tier: PlanTier | null = isPlanTier(tierParam) && isPurchasablePlan(tierParam) ? tierParam : null;
  const interval: BillingIntervalId = isBillingInterval(intervalParam) ? intervalParam : "MONTHLY";
  if (!tier) redirect("/settings/billing?error=plan");

  const overview = await getBillingOverview(ctx.organization.id);
  if (overview.hasSubscription) redirect("/settings/billing");

  if (!isBillingConfigured() || !resolveProductId(tier, interval)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-lg animate-fade-in">
          <div className="mb-6 flex justify-center">
            <Link
              href="/dashboard"
              aria-label={brand.name}
              className="inline-flex items-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogoMark size={26} />
              <Wordmark height={12} />
            </Link>
          </div>
          <BillingUnavailable />
          <div className="mt-5 text-center">
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/billing">Back to billing</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <CheckoutClient
        tier={tier}
        initialInterval={interval}
        email={ctx.user.email}
        defaultName={ctx.user.name ?? ""}
        organizationName={ctx.organization.name}
        mode={getDodoMode()}
      />
      <span className="sr-only">{PLANS[tier].label} plan checkout</span>
    </main>
  );
}
