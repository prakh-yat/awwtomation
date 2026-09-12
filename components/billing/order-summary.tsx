"use client";

import type { PlanTier } from "@prisma/client";
import { Check } from "lucide-react";

import { IntervalToggle } from "@/components/billing/interval-toggle";
import { LogoMark } from "@/components/ui/logo";
import {
  annualSavingsPercent,
  type BillingIntervalId,
  formatUsd,
  intervalSuffix,
  monthlyEquivalentCents,
  PLANS,
  planPriceCents,
} from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { formatNumber } from "@/lib/utils";

/** Right-rail order summary for /checkout. Everything is derived from PLANS so prices can't drift. */
export function OrderSummary({
  tier,
  interval,
  onIntervalChange,
}: {
  tier: PlanTier;
  interval: BillingIntervalId;
  onIntervalChange: (next: BillingIntervalId) => void;
}) {
  const plan = PLANS[tier];
  const price = planPriceCents(tier, interval);
  const included = [
    `${plan.channels} connected account${plan.channels === 1 ? "" : "s"}`,
    `${formatNumber(plan.automations)} automations`,
    `${formatNumber(plan.dmsPerMonth)} DMs per month`,
    `${plan.members} team seat${plan.members === 1 ? "" : "s"}`,
    plan.broadcasts ? "Broadcasts to tagged audiences" : null,
  ].filter((f): f is string => f !== null);

  return (
    <aside className="flex h-full flex-col">
      <div className="mb-8 flex items-center gap-2">
        <LogoMark size={22} />
        <span className="text-sm font-semibold tracking-tight">{brand.name}</span>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted-foreground">Order summary</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{plan.label} plan</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{plan.description}</p>
          </div>
        </div>

        <div className="mt-4">
          <IntervalToggle value={interval} onChange={onIntervalChange} savingsPercent={annualSavingsPercent(tier)} size="sm" />
        </div>

        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatUsd(price)}</span>
          <span className="text-sm text-muted-foreground">{intervalSuffix(interval)}</span>
        </div>
        {interval === "ANNUAL" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatUsd(monthlyEquivalentCents(tier, interval))}/month, billed once a year.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Billed every month. Cancel anytime.</p>
        )}

        <dl className="mt-5 space-y-2 border-t pt-4 text-[13px]">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              {plan.label} · {interval === "ANNUAL" ? "annual" : "monthly"}
            </dt>
            <dd className="tabular-nums">{formatUsd(price)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="text-muted-foreground">Calculated at checkout</dd>
          </div>
          <div className="flex items-center justify-between border-t pt-2 font-medium">
            <dt>Due today</dt>
            <dd className="tabular-nums">{formatUsd(price)}</dd>
          </div>
        </dl>

        <div className="mt-5 border-t pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What&apos;s included</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Prices in USD. Tax is added at checkout where required by your country. Your plan renews automatically until
        cancelled; usage limits reset on the 1st of each month.
      </p>
      <p className="mt-auto pt-8 text-[11px] text-muted-foreground">Payments processed by Dodo Payments.</p>
    </aside>
  );
}
