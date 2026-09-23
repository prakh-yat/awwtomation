import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";

import { BillingActions } from "@/components/billing/billing-actions";
import { BillingUnavailable } from "@/components/billing/billing-unavailable";
import { ON_DARK } from "@/components/billing/on-dark";
import { PaymentHistory } from "@/components/billing/payment-history";
import { PlanGrid } from "@/components/billing/plan-grid";
import { ServiceStateBadge } from "@/components/billing/status-badge";
import { UsageBars, type UsageRow } from "@/components/settings/usage-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { formatUsd, PLANS } from "@/lib/billing/plans";
import { getOrganizationUsage } from "@/lib/billing/usage";
import { getBillingOverview, listPayments } from "@/lib/services/billing";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageBilling } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string | string[] }>;

const QUERY_ERRORS: Record<string, string> = {
  owner: "Only an owner can buy a plan. Ask an owner to upgrade, or to make you an owner.",
  plan: "That plan isn't available to buy. Pick one below.",
};

export default async function BillingSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  if (!canManageBilling(ctx.role)) redirect("/settings");
  const isOwner = ctx.role === "OWNER";

  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const queryError = errorKey ? QUERY_ERRORS[errorKey] : undefined;

  const [overview, usage, payments] = await Promise.all([
    getBillingOverview(ctx.organization.id),
    getOrganizationUsage(ctx.organization.id),
    listPayments(ctx.organization.id),
  ]);
  const plan = PLANS[overview.effectivePlan];
  const resetLabel = format(usage.periodEnd, "MMM d");

  const rows: UsageRow[] = [
    { label: "DMs this month", used: usage.dms.used, limit: usage.dms.limit, hint: `Resets ${resetLabel}` },
    { label: "Connected accounts", used: usage.channels.used, limit: usage.channels.limit },
    { label: "Automations", used: usage.automations.used, limit: usage.automations.limit },
    { label: "Team seats", used: usage.members.used, limit: usage.members.limit, hint: "Includes pending invites" },
  ];
  const anyExhausted = rows.some((r) => r.used >= r.limit);

  const price =
    overview.amountCents !== null && overview.interval
      ? { amount: formatUsd(overview.amountCents), per: overview.interval === "ANNUAL" ? "year" : "month" }
      : { amount: `$${plan.priceUsd}`, per: "month" };

  // The status sentence already carries the renewal, end or grace date, so it isn't repeated here.
  const metaBits: string[] = [];
  if (overview.hasSubscription && overview.interval) {
    metaBits.push(overview.interval === "ANNUAL" ? "Billed yearly" : "Billed monthly");
    if (overview.customerEmail) metaBits.push(`Receipts to ${overview.customerEmail}`);
  }

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-10">
        {queryError ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-orange-soft px-4 py-3 text-[13px] text-ink">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-ink" />
            <p>{queryError}</p>
          </div>
        ) : null}

        {!overview.configured ? <BillingUnavailable /> : null}

        <section aria-label="Current plan" className="rise overflow-hidden rounded-3xl bg-ink text-white">
          <div className="bg-grid bg-grid-light px-6 pb-7 pt-7 sm:px-8 sm:pt-8">
            <div className="flex flex-wrap items-center gap-2">
              <p className="brand-label mr-1 text-white/60">Current plan</p>
              <ServiceStateBadge label={overview.serviceLabel} tone={overview.serviceTone} onDark />
              {anyExhausted ? <Badge className="bg-orange text-ink">Limit reached</Badge> : null}
              {overview.planSource === "ADMIN_OVERRIDE" ? <Badge className="bg-white/15 text-white">Custom plan</Badge> : null}
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <h2 className="font-display text-[52px] leading-[0.9] sm:text-[72px]">{plan.label}</h2>
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-[34px] leading-none tabular-nums sm:text-[44px]">{price.amount}</span>
                <span className="brand-label text-white/60">/{price.per}</span>
              </p>
            </div>
            <p className="mt-4 max-w-2xl text-[14px] text-white/75">{overview.serviceDescription}</p>
            {metaBits.length > 0 ? <p className="mt-1 text-[12px] text-white/50">{metaBits.join(" · ")}</p> : null}
          </div>

          <div className="border-t border-white/10 px-6 py-6 sm:px-8">
            <UsageBars rows={rows} dark className="lg:grid-cols-4" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
            <BillingActions overview={overview} canManage={isOwner} />
            <Button asChild variant="ghost" size="sm" className={ON_DARK.ghost}>
              <Link href="/settings/team">Manage seats</Link>
            </Button>
          </div>
        </section>

        <section id="plans" className="scroll-mt-24">
          <PlanGrid
            effectivePlan={overview.effectivePlan}
            subscribedPlan={overview.subscribedPlan}
            currentInterval={overview.interval}
            serviceState={overview.serviceState}
            hasSubscription={overview.hasSubscription}
            canManage={isOwner}
            configured={overview.configured}
            unavailablePlans={overview.unavailablePlans}
          />
        </section>

        <section>
          <h2 className="brand-label mb-4 text-muted-foreground">Payment history</h2>
          <PaymentHistory payments={payments} hasSubscription={overview.hasSubscription} />
        </section>
      </div>
    </div>
  );
}
