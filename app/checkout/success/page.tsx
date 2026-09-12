import type { Metadata } from "next";
import Link from "next/link";

import { ActivationPoller } from "@/components/billing/activation-poller";
import { isBillingInterval, isPlanTier } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Activating your plan · ${brand.name}`, robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length <= 200 ? v : undefined;
}

/**
 * Dodo returns here with `payment_id`, `subscription_id` and `status` appended
 * to the return URL we registered (`?workspace=&tier=&interval=`). We pass the
 * ids on to the poller; it never trusts them for activation — the server
 * re-reads everything from Dodo with our own key.
 */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;

  const tier = first(params.tier)?.toUpperCase();
  const interval = first(params.interval)?.toUpperCase();
  const retryHref =
    isPlanTier(tier) && isBillingInterval(interval) ? `/checkout?tier=${tier}&interval=${interval}` : "/settings/billing";

  const ids = {
    sessionId: first(params.session_id) ?? first(params.checkout_session_id),
    paymentId: first(params.payment_id),
    subscriptionId: first(params.subscription_id),
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 text-center">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-foreground">
            {brand.name}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{ctx.workspace.name}</p>
        </div>
        <div className="rounded-lg border bg-card p-8 shadow-card">
          <ActivationPoller ids={ids} providerStatus={first(params.status)} retryHref={retryHref} />
        </div>
      </div>
    </main>
  );
}
