"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";
import { Check } from "lucide-react";

import { IntervalToggle } from "@/components/billing/interval-toggle";
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
 * Four plans × monthly/annual. Free organizations link straight to /checkout;
 * subscribers switch in place through /api/billing/change-plan (prorated).
 * Driven entirely by PLANS so the pricing page and this grid never disagree.
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

  async function confirmSwitch() {
    if (!pending) return;
    try {
      const result = await apiFetch<BillingOverview>("/api/billing/change-plan", { method: "POST", json: pending });
      toast.success(`Switched to ${PLANS[result.effectivePlan].label} (${pending.interval === "ANNUAL" ? "annual" : "monthly"})`);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && err.code === "PAYMENT_FAILED") {
        toast.error(err.message, { description: "Open “Manage payment methods” to update your card, then try again." });
      } else {
        toast.error(errorMessage(err, "Couldn't change plan"));
      }
      throw err; // keep the dialog open for a retry
    }
  }

  function renderAction(tier: PlanTier) {
    const isCurrent = tier === currentTier && (!hasSubscription || tier === "FREE" || interval === currentInterval);
    const productMissing = isPurchasablePlan(tier) && unavailablePlans.includes(`${tier}_${interval}`);
    const disabledReason = !canManage
      ? "Only an owner of the organization can change billing"
      : !configured
        ? "Plan changes are unavailable right now"
        : productMissing
          ? "This plan is unavailable right now"
          : null;

    if (isCurrent) {
      return (
        <Button className="pointer-events-none w-full" aria-disabled tabIndex={-1} variant="outline">
          Current plan
        </Button>
      );
    }

    if (tier === "FREE") {
      // Downgrading to Free is a cancellation, handled from the plan card so the copy explains the period end.
      return (
        <Button variant="outline" className="w-full" disabled title="Cancel your plan from the card above to move to Free">
          {hasSubscription ? "Cancel to switch" : "Included"}
        </Button>
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
      : `Upgrade to ${PLANS[tier].label}`;

    if (disabledReason) {
      return (
        <Button variant={upgrade ? "default" : "outline"} className="w-full" disabled title={disabledReason}>
          {label}
        </Button>
      );
    }

    if (!hasSubscription) {
      return (
        <Button asChild variant={upgrade ? "default" : "outline"} className="w-full">
          <Link href={`/checkout?tier=${tier}&interval=${interval}`}>{label}</Link>
        </Button>
      );
    }

    return (
      <Button
        variant={upgrade || sameTier ? "default" : "outline"}
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
        <IntervalToggle value={interval} onChange={setInterval} savingsPercent={annualSavingsPercent("PRO")} />
        <p className="text-xs text-muted-foreground">
          {interval === "ANNUAL" ? "Annual plans are billed once a year at a discount." : "Monthly plans renew every month."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const isCurrent = tier === currentTier;
          const price = planPriceCents(tier, interval);
          return (
            <div
              key={tier}
              className={cn(
                "flex flex-col rounded-lg border bg-card p-5 shadow-card",
                isCurrent && "border-foreground ring-1 ring-foreground",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold tracking-tight">{plan.label}</h3>
                {isCurrent ? <Badge>Current</Badge> : null}
              </div>
              <p className="mt-1 min-h-[2.5rem] text-[13px] text-muted-foreground">{plan.description}</p>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatUsd(price)}</span>
                <span className="text-sm text-muted-foreground">{tier === "FREE" ? "/month" : intervalSuffix(interval)}</span>
              </p>
              <p className="mt-1 h-4 text-xs text-muted-foreground">
                {tier !== "FREE" && interval === "ANNUAL" ? `${formatUsd(monthlyEquivalentCents(tier, interval))}/month, billed yearly` : ""}
              </p>

              <div className="mt-4">{renderAction(tier)}</div>

              <ul className="mt-5 space-y-2 text-[13px]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-foreground" aria-hidden />
                    <span className="text-foreground/80">{feature}</span>
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
        title={pending ? `Switch to ${PLANS[pending.tier].label} (${pending.interval === "ANNUAL" ? "annual" : "monthly"})?` : "Change plan"}
        description={
          pending
            ? pendingUpgrade
              ? `You'll be charged the prorated difference for the rest of the current period today, and ${formatUsd(planPriceCents(pending.tier, pending.interval))}${intervalSuffix(pending.interval)} from the next renewal. New limits apply immediately.`
              : `The change applies immediately. Unused time on your current plan is credited to your billing balance and used against future invoices. Lower limits apply straight away. Anything over the new limits stays, but you can't add more.`
            : undefined
        }
        confirmLabel={pendingUpgrade ? "Confirm and pay" : "Confirm downgrade"}
        onConfirm={confirmSwitch}
      />
    </div>
  );
}
