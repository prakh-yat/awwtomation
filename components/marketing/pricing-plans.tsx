"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  annualSavingsPercent,
  type BillingIntervalId,
  formatUsd,
  monthlyEquivalentCents,
  PLAN_ORDER,
  PLANS,
  planPriceCents,
  PURCHASABLE_PLANS,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

import { planLines, RECOMMENDED_PLAN, Tick } from "./plans";

const INTERVALS: Array<{ id: BillingIntervalId; label: string }> = [
  { id: "MONTHLY", label: "Monthly" },
  { id: "ANNUAL", label: "Yearly" },
];

/**
 * Plan cards with a monthly/yearly switch. Free goes to sign-in; paid plans
 * go to /checkout with the chosen tier and interval (signed-out visitors are
 * sent through /login first by the middleware, then land back on checkout).
 * The recommended plan is the yellow block.
 */
function PricingPlans({ className }: { className?: string }) {
  const [interval, setInterval] = React.useState<BillingIntervalId>("MONTHLY");
  const savings = Math.min(...PURCHASABLE_PLANS.map(annualSavingsPercent));

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-3">
        <fieldset className="inline-flex rounded-full bg-fog p-1">
          <legend className="sr-only">Billing period</legend>
          {INTERVALS.map((option) => {
            const active = option.id === interval;
            return (
              <label
                key={option.id}
                className={cn(
                  "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-5 text-[13px] font-semibold transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  active ? "bg-ink text-white" : "text-ink/70 hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name="billing-period"
                  value={option.id}
                  checked={active}
                  onChange={() => setInterval(option.id)}
                  className="sr-only"
                />
                {option.label}
                {option.id === "ANNUAL" ? (
                  <span className="rounded-full bg-yellow px-1.5 text-[11px] leading-[18px] text-ink">Save {savings}%</span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
        <p className="text-[13px] text-muted-foreground">
          {interval === "ANNUAL"
            ? `Billed once a year, ${savings}% less than paying monthly.`
            : `Pay yearly and save ${savings}%.`}
        </p>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((tier, index) => {
          const plan = PLANS[tier];
          const paid = tier !== "FREE";
          const featured = tier === RECOMMENDED_PLAN;
          const price = paid ? formatUsd(planPriceCents(tier, interval)) : "$0";
          const suffix = paid && interval === "ANNUAL" ? "/year" : "/month";
          const note = !paid
            ? "No card needed"
            : interval === "ANNUAL"
              ? `${formatUsd(monthlyEquivalentCents(tier, interval))} a month, billed yearly`
              : "";
          const href = paid ? `/checkout?tier=${tier}&interval=${interval}` : "/login";

          return (
            <div
              key={tier}
              className={cn("rise flex flex-col rounded-[28px] p-6 sm:p-7", featured ? "bg-yellow" : "bg-fog")}
              style={{ "--i": index } as React.CSSProperties}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h2 className="font-display text-[30px] leading-none tracking-[-0.03em] xl:text-[26px]">{plan.label}</h2>
                {featured ? (
                  <span className="brand-label rounded-full bg-ink px-2.5 py-1 text-[10px] text-white">Recommended</span>
                ) : null}
              </div>
              {/* Two lines reserved so prices line up across the cards. */}
              <p className="mt-2.5 text-[14px] leading-5 text-ink/70 sm:min-h-10">{plan.description}</p>

              <p className="mt-8 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="font-display text-[48px] leading-none tracking-[-0.04em] tabular-nums">{price}</span>
                <span className="brand-label text-ink/60">{suffix}</span>
              </p>
              {/* Reserved in the multi-column layouts so prices and buttons line up across plans. */}
              <p className={cn("mt-2.5 text-[13px] leading-5 text-ink/65 sm:min-h-5", !note && "hidden sm:block")}>{note}</p>

              <Button
                asChild
                size="lg"
                variant={featured ? "default" : "outline"}
                className={cn("mt-7 w-full", !featured && "border-ink/25 bg-transparent hover:border-ink hover:bg-ink hover:text-white")}
              >
                <Link href={href}>{paid ? `Choose ${plan.label}` : "Start free"}</Link>
              </Button>

              <ul className="mt-7 space-y-3 border-t border-ink/10 pt-6 text-[14px] leading-5">
                {planLines(tier).map((line) => (
                  <li key={line.text} className="flex items-start gap-2.5">
                    <Tick included={line.included} />
                    <span className={line.included ? "text-ink/85" : "text-ink/60"}>{line.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { PricingPlans };
