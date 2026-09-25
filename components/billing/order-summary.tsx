"use client";

import type { PlanTier } from "@prisma/client";

import { IntervalToggle } from "@/components/billing/interval-toggle";
import { FeatureCheck, PlanSwatch } from "@/components/billing/plan-badge";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import {
  annualSavingsPercent,
  type BillingIntervalId,
  formatUsd,
  historyLabel,
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
  const annual = interval === "ANNUAL";
  const included = [
    `${plan.channels} connected account${plan.channels === 1 ? "" : "s"}`,
    `${formatNumber(plan.automations)} automations`,
    `${formatNumber(plan.dmsPerMonth)} DMs per month`,
    `${formatNumber(plan.contacts)} contacts`,
    `${plan.members} team seat${plan.members === 1 ? "" : "s"}`,
    plan.broadcastsPerMonth > 0 ? `${formatNumber(plan.broadcastsPerMonth)} broadcasts per month` : null,
    `${historyLabel(plan.historyDays)} of history`,
  ].filter((f): f is string => f !== null);

  return (
    <aside className="flex h-full flex-col">
      {/* On phones the logo sits above the form instead. */}
      <div className="mb-8 hidden items-center gap-0.5 lg:flex" aria-label={brand.name}>
        <LogoMark size={22} />
        <Wordmark height={10} />
      </div>

      <div className="rounded-3xl bg-card p-6 shadow-card">
        <p className="brand-label text-muted-foreground">Order summary</p>
        <h2 className="font-display mt-3 flex items-center gap-2.5 text-[32px] leading-none">
          <PlanSwatch plan={tier} />
          {plan.label}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">{plan.description}</p>

        <IntervalToggle value={interval} onChange={onIntervalChange} savingsPercent={annualSavingsPercent(tier)} size="sm" className="mt-5" />

        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="font-display text-[44px] leading-none tabular-nums">{formatUsd(price)}</span>
          <span className="brand-label text-muted-foreground">{intervalSuffix(interval)}</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {annual ? `${formatUsd(monthlyEquivalentCents(tier, interval))}/month, billed once a year.` : "Billed every month."}
        </p>

        <dl className="mt-6 space-y-2.5 border-t pt-4 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">
              {plan.label} · {annual ? "annual" : "monthly"}
            </dt>
            <dd className="tabular-nums">{formatUsd(price)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="text-muted-foreground">Added in the next step</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t pt-3">
            <dt className="font-semibold">Due today</dt>
            <dd className="font-display text-[20px] leading-none tabular-nums">{formatUsd(price)}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t pt-4">
          <p className="brand-label text-muted-foreground">Included</p>
          <ul className="mt-3 space-y-2 text-[13px]">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <FeatureCheck />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Prices in USD. Renews until you cancel.
      </p>
    </aside>
  );
}
