"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";
import { Check } from "lucide-react";

import { IntervalToggle } from "@/components/billing/interval-toggle";
import { FeatureCheck, PlanSwatch } from "@/components/billing/plan-badge";
import { apiFetch, ClientApiError, errorMessage } from "@/components/settings/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import type { ServiceState } from "@/lib/billing/entitlements";
import {
  annualSavingsPercent,
  type BillingIntervalId,
  comparePlans,
  formatUsd,
  intervalSuffix,
  isPurchasablePlan,
  monthlyEquivalentCents,
  PLAN_ORDER,
  PLANS,
  planPriceCents,
} from "@/lib/billing/plans";
import type { BillingOverview } from "@/lib/services/billing";
import { cn } from "@/lib/utils";

export interface PlanGridProps {
  /** Plan whose limits apply today (drives the "Current plan" marker for free/override organizations). */
  effectivePlan: PlanTier;
  subscribedPlan: PlanTier | null;
  currentInterval: BillingIntervalId | null;
  serviceState: ServiceState;
  hasSubscription: boolean;
  /** OWNER only; admins see the grid read-only. */
  canManage: boolean;
  configured: boolean;
  /** Plan/interval pairs that can't be bought right now, e.g. "PRO_ANNUAL". */
  unavailablePlans: readonly string[];
}

type Pending = { tier: PlanTier; interval: BillingIntervalId } | null;

/**
 * Three plans × monthly/annual, laid out like the pricing page: fog cards, with
 * the next plan up as the yellow block. Organizations without a plan link
 * straight to /checkout; subscribers switch in place through /api/billing/change-plan
 * (prorated). Driven entirely by PLANS so the pricing page and this grid never disagree.
 */
export function PlanGrid({
  effectivePlan,
  subscribedPlan,
  currentInterval,
  serviceState,
  hasSubscription,
  canManage,
  configured,
  unavailablePlans,
}: PlanGridProps) {
  const router = useRouter();
  const [interval, setInterval] = React.useState<BillingIntervalId>(currentInterval ?? "MONTHLY");
  const [pending, setPending] = React.useState<Pending>(null);

  const currentTier = hasSubscription ? (subscribedPlan ?? effectivePlan) : effectivePlan;
  const unpaid = serviceState === "grace" || serviceState === "lapsed";
  // The next plan up is the one worth pointing at; on the top plan there is none.
  const recommendedTier: PlanTier | null = PLAN_ORDER[PLAN_ORDER.indexOf(currentTier) + 1] ?? null;

  async function confirmSwitch() {
    if (!pending) return;
    try {
      const result = await apiFetch<BillingOverview>("/api/billing/change-plan", { method: "POST", json: pending });
      toast.success(`Switched to ${PLANS[result.effectivePlan].label} (${pending.interval === "ANNUAL" ? "annual" : "monthly"})`);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && err.code === "PAYMENT_FAILED") {
        toast.error(err.message, { description: "Update your card under Payment methods & invoices, then try again." });
      } else {
        toast.error(errorMessage(err, "Couldn't change plan"));
      }
      throw err; // keep the dialog open for a retry
    }
  }

  function renderAction(tier: PlanTier) {
    const isCurrent = tier === currentTier && (!hasSubscription || interval === currentInterval);
    const productMissing = isPurchasablePlan(tier) && unavailablePlans.includes(`${tier}_${interval}`);
    const disabledReason = !canManage
      ? "Only an owner can change billing"
      : !configured
        ? "Plan changes are unavailable right now"
        : productMissing
          ? "This plan is unavailable right now"
          : null;

    if (isCurrent) {
      return (
        <div className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-ink/15 text-[15px] font-semibold text-ink/70">
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Current plan
        </div>
      );
    }

    const upgrade = comparePlans(currentTier, tier) > 0;
    const sameTier = tier === currentTier;
    const label = hasSubscription
      ? sameTier
        ? `Switch to ${interval === "ANNUAL" ? "annual" : "monthly"} billing`
        : upgrade
          ? `Upgrade to ${PLANS[tier].label}`
          : `Downgrade to ${PLANS[tier].label}`
      : currentTier === "NONE"
        ? `Choose ${PLANS[tier].label}`
        : `Upgrade to ${PLANS[tier].label}`;

    if (disabledReason) {
      return (
        <Button variant={upgrade ? "default" : "outline"} size="lg" className="w-full" disabled title={disabledReason}>
          {label}
        </Button>
      );
    }

    if (!hasSubscription) {
      return (
        <Button asChild variant={upgrade ? "default" : "outline"} size="lg" className="w-full">
          <Link href={`/checkout?tier=${tier}&interval=${interval}`}>{label}</Link>
        </Button>
      );
    }

    return (
      <Button
        variant={upgrade || sameTier ? "default" : "outline"}
        size="lg"
        className="w-full"
        disabled={unpaid}
        title={unpaid ? "Update your payment method before changing plans" : undefined}
        onClick={() => setPending({ tier, interval })}
      >
        {label}
      </Button>
    );
  }

  const pendingUpgrade = pending ? comparePlans(currentTier, pending.tier) >= 0 : false;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="brand-label text-muted-foreground">Plans</h2>
        <IntervalToggle value={interval} onChange={setInterval} savingsPercent={annualSavingsPercent("PRO")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLAN_ORDER.map((tier, index) => {
          const plan = PLANS[tier];
          const isCurrent = tier === currentTier;
          const recommended = tier === recommendedTier;
          return (
            <div
              key={tier}
              className={cn("rise flex flex-col rounded-3xl p-6", recommended ? "bg-yellow" : "bg-fog", isCurrent && "ring-2 ring-inset ring-ink")}
              style={{ "--i": index } as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display flex min-w-0 items-center gap-2.5 text-[28px] leading-none">
                  <PlanSwatch plan={tier} />
                  <span className="truncate">{plan.label}</span>
                </h3>
                {isCurrent ? <Badge>Current</Badge> : recommended ? <Badge>Recommended</Badge> : null}
              </div>
              <p className="mt-2 min-h-[2.5rem] text-[13px] leading-snug text-ink/70">{plan.description}</p>

              {/* Priced per month in both modes, as on the pricing page, so the annual saving shows at a glance. */}
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-[44px] leading-none tabular-nums">{formatUsd(monthlyEquivalentCents(tier, interval))}</span>
                <span className="brand-label text-ink/60">/mo</span>
              </p>
              <p className="brand-label mt-2 min-h-[1.2em] text-ink/60">
                {interval === "ANNUAL" ? `${formatUsd(planPriceCents(tier, interval))} billed yearly` : "Billed monthly"}
              </p>

              <div className="mt-6">{renderAction(tier)}</div>

              <ul className="mt-6 space-y-2.5 text-[13px]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <FeatureCheck />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        trigger={null}
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? `Switch to ${PLANS[pending.tier].label}, billed ${pending.interval === "ANNUAL" ? "yearly" : "monthly"}?` : "Change plan"}
        description={
          pending
            ? pendingUpgrade
              ? `Today you pay the difference for the rest of this period, then ${formatUsd(planPriceCents(pending.tier, pending.interval))}${intervalSuffix(pending.interval)}. New limits apply now.`
              : "Lower limits apply now, and unused time is credited to your next invoices. Anything over the new limits stays, but you can't add more."
            : undefined
        }
        confirmLabel={pendingUpgrade ? "Pay and switch" : "Downgrade"}
        onConfirm={confirmSwitch}
      />
    </div>
  );
}
