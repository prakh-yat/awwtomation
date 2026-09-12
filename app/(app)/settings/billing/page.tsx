import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";

import { BillingActions } from "@/components/billing/billing-actions";
import { OperatorNotice } from "@/components/billing/operator-notice";
import { PaymentHistory } from "@/components/billing/payment-history";
import { PlanGrid } from "@/components/billing/plan-grid";
import { ServiceStateBadge } from "@/components/billing/status-badge";
import { UsageBars, type UsageRow } from "@/components/settings/usage-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatUsd, intervalSuffix, PLANS } from "@/lib/billing/plans";
import { getUsage } from "@/lib/billing/usage";
import { getBillingOverview, listPayments } from "@/lib/services/billing";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageBilling } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string | string[] }>;

const QUERY_ERRORS: Record<string, string> = {
  owner: "Only the workspace owner can start a checkout. Ask them to upgrade, or have them make you an owner.",
  plan: "That plan isn't available for purchase. Pick one below.",
};

function SectionHeader({ id, title, description }: { id?: string; title: string; description: string }) {
  return (
    <div id={id} className="mb-3 scroll-mt-24">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}

function periodDate(iso: string | null): string | null {
  return iso ? format(new Date(iso), "MMM d, yyyy") : null;
}

export default async function BillingSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  if (!canManageBilling(ctx.role)) redirect("/settings");
  const isOwner = ctx.role === "OWNER";

  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const queryError = errorKey ? QUERY_ERRORS[errorKey] : undefined;

  const [overview, usage, payments] = await Promise.all([
    getBillingOverview(ctx.workspace.id),
    getUsage(ctx.workspace.id),
    listPayments(ctx.workspace.id),
  ]);
  const plan = PLANS[overview.effectivePlan];
  const resetLabel = format(usage.periodEnd, "MMM d");

  const rows: UsageRow[] = [
    { label: "DMs this month", used: usage.dms.used, limit: usage.dms.limit, hint: `Resets ${resetLabel}` },
    { label: "Connected channels", used: usage.channels.used, limit: usage.channels.limit },
    { label: "Automations", used: usage.automations.used, limit: usage.automations.limit },
    { label: "Team seats", used: usage.members.used, limit: usage.members.limit, hint: "Includes pending invitations" },
  ];
  const anyExhausted = rows.some((r) => r.used >= r.limit);

  const renewal = periodDate(overview.currentPeriodEnd);
  const metaBits: string[] = [];
  if (overview.hasSubscription && overview.interval) {
    metaBits.push(overview.interval === "ANNUAL" ? "Billed annually" : "Billed monthly");
    if (renewal) {
      if (overview.serviceState === "cancelling") metaBits.push(`Ends ${renewal}`);
      else if (overview.serviceState === "trialing") metaBits.push(`Trial ends ${renewal}`);
      else if (overview.serviceState === "grace" || overview.serviceState === "lapsed") metaBits.push(`Payment due since ${renewal}`);
      else metaBits.push(`Renews ${renewal}`);
    }
    if (overview.customerEmail) metaBits.push(`Receipts to ${overview.customerEmail}`);
  } else {
    metaBits.push(`Usage period ${format(usage.periodStart, "MMM d")} – ${format(usage.periodEnd, "MMM d, yyyy")} (UTC)`);
  }

  return (
    <div className="space-y-8">
      {queryError ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/5 p-3 text-[13px]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{queryError}</p>
        </div>
      ) : null}

      {!overview.configured ? (
        <OperatorNotice configured={false} missingProducts={overview.missingProducts} compact />
      ) : overview.missingProducts.length > 0 && ctx.isSuperAdmin ? (
        <OperatorNotice configured missingProducts={overview.missingProducts} />
      ) : null}

      <section>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{plan.label} plan</h2>
                <ServiceStateBadge label={overview.serviceLabel} tone={overview.serviceTone} />
                {anyExhausted ? <Badge variant="warning">Limit reached</Badge> : null}
                {overview.planSource === "ADMIN_OVERRIDE" ? <Badge variant="outline">Set by platform team</Badge> : null}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{overview.serviceDescription}</p>
              <p className="mt-2 text-xs text-muted-foreground">{metaBits.join(" · ")}</p>
            </div>
            <div className="shrink-0 text-right">
              {overview.amountCents !== null && overview.interval ? (
                <>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatUsd(overview.amountCents)}</p>
                  <p className="text-xs text-muted-foreground">per {overview.interval === "ANNUAL" ? "year" : "month"}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">${plan.priceUsd}</p>
                  <p className="text-xs text-muted-foreground">per month</p>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <UsageBars rows={rows} />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <BillingActions overview={overview} canManage={isOwner} />
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings/team">Manage seats</Link>
              </Button>
            </div>
            {overview.serviceState === "grace" || overview.serviceState === "lapsed" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Tip: open “Manage payment methods &amp; invoices” to add a working card — Dodo retries the charge automatically.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeader
          id="plans"
          title="Plans"
          description={
            overview.hasSubscription
              ? `Switch plans any time. Upgrades are prorated and take effect immediately${
                  overview.subscribedPlan ? `; you're on ${PLANS[overview.subscribedPlan].label}${overview.interval ? ` (${overview.interval === "ANNUAL" ? "annual" : "monthly"})` : ""}` : ""
                }.`
              : "Pay by card through Dodo Payments. Cancel anytime; limits change the moment your payment clears."
          }
        />
        <PlanGrid
          effectivePlan={overview.effectivePlan}
          subscribedPlan={overview.subscribedPlan}
          currentInterval={overview.interval}
          serviceState={overview.serviceState}
          hasSubscription={overview.hasSubscription}
          canManage={isOwner}
          configured={overview.configured}
          missingProducts={overview.missingProducts}
        />
        {overview.hasSubscription && overview.amountCents !== null && overview.interval ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Current charge: {formatUsd(overview.amountCents)}
            {intervalSuffix(overview.interval)} plus applicable tax.
          </p>
        ) : null}
      </section>

      <section>
        <SectionHeader title="Payment history" description="Every charge on this workspace, with invoice PDFs from Dodo." />
        <PaymentHistory payments={payments} hasSubscription={overview.hasSubscription} />
      </section>
    </div>
  );
}
