import type { Metadata } from "next";
import Link from "next/link";

import { ActivationPoller } from "@/components/billing/activation-poller";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { isBillingInterval, isPlanTier } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activating your plan", robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length <= 200 ? v : undefined;
}

/**
 * Dodo returns here with `payment_id`, `subscription_id` and `status` appended
 * to the return URL we registered (`?organization=&tier=&interval=`). We pass the
 * ids on to the poller; it never trusts them for activation: the server
 * re-reads everything from Dodo with our own key.
 */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;

  const tier = first(params.tier)?.toUpperCase();
  const interval = first(params.interval)?.toUpperCase();
  const retryHref =
    isPlanTier(tier) && isBillingInterval(interval) ? `/checkout?tier=${tier}&interval=${interval}` : "/settings/billing";

  // The return URL names the organization that paid. When this browser has since
  // switched to another one, open the paying organization again (members only).
  const paidFor = first(params.organization);
  const target = paidFor ? ctx.organizations.find((o) => o.organization.id === paidFor)?.organization : undefined;
  const switchTo = target && target.id !== ctx.organization.id ? target : undefined;

  const ids = {
    sessionId: first(params.session_id) ?? first(params.checkout_session_id),
    paymentId: first(params.payment_id),
    subscriptionId: first(params.subscription_id),
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-fog px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 flex flex-col items-center">
          <Link
            href="/dashboard"
            aria-label={brand.name}
            className="inline-flex items-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogoMark size={26} />
            <Wordmark height={12} />
          </Link>
          <p className="brand-label mt-3 text-muted-foreground">{(switchTo ?? ctx.organization).name}</p>
        </div>
        <div className="rounded-3xl bg-card px-6 py-10 shadow-card sm:px-10">
          <ActivationPoller ids={ids} switchToOrganizationId={switchTo?.id} providerStatus={first(params.status)} retryHref={retryHref} />
        </div>
      </div>
    </main>
  );
}
