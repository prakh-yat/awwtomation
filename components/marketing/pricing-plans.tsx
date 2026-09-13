"use client";

import * as React from "react";
import Link from "next/link";
import type { PlanTier } from "@prisma/client";
import { Check, Minus } from "lucide-react";

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

/** Service extras on top of the limits, matching the plan copy in lib/billing/plans.ts. */
const EXTRAS: Partial<Record<PlanTier, string[]>> = {
  PRO: ["Priority support"],
  AGENCY: ["Priority support", "Dedicated onboarding"],
};

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

type Line = { text: string; included: boolean };

/** Each limit appears exactly once per plan. */
function planLines(tier: PlanTier): Line[] {
  const plan = PLANS[tier];
  return [
    { text: plural(plan.channels, "connected account", "connected accounts"), included: true },
    { text: plural(plan.automations, "automation", "automations"), included: true },
    { text: `${count(plan.dmsPerMonth)} DMs a month`, included: true },
    { text: plural(plan.members, "team member", "team members"), included: true },
    { text: plan.broadcasts ? "Broadcasts" : "No broadcasts", included: plan.broadcasts },
    ...(EXTRAS[tier] ?? []).map((text) => ({ text, included: true })),
  ];
}

const INTERVALS: Array<{ id: BillingIntervalId; label: string }> = [
  { id: "MONTHLY", label: "Monthly" },
  { id: "ANNUAL", label: "Yearly" },
];

/**
 * Plan columns with a monthly/yearly switch. Free goes to sign-in; paid plans
 * go to /checkout with the chosen tier and interval (signed-out visitors are
 * sent through /login first by the middleware, then land back on checkout).
 */
function PricingPlans({ className }: { className?: string }) {
  const [interval, setInterval] = React.useState<BillingIntervalId>("MONTHLY");
  const savings = Math.min(...PURCHASABLE_PLANS.map(annualSavingsPercent));

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <fieldset className="inline-flex rounded-lg border bg-muted/60 p-1">
          <legend className="sr-only">Billing period</legend>
          {INTERVALS.map((option) => {
            const active = option.id === interval;
            return (
              <label
                key={option.id}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3.5 text-[13px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
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

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const paid = tier !== "FREE";
          const price = paid ? formatUsd(planPriceCents(tier, interval)) : "$0";
          const suffix = paid && interval === "ANNUAL" ? "/year" : "/month";
          const note = !paid
            ? "No card needed"
            : interval === "ANNUAL"
              ? `${formatUsd(monthlyEquivalentCents(tier, interval))} a month, billed yearly`
              : "";
          const href = paid ? `/checkout?tier=${tier}&interval=${interval}` : "/login";

          return (
            <div key={tier} className="flex flex-col bg-background p-6">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{plan.label}</h2>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{PLANS[tier].description}</p>

              <p className="mt-7 flex items-baseline gap-1">
                <span className="text-[36px] font-semibold leading-none tracking-[-0.025em] tabular-nums">{price}</span>
                <span className="text-[13px] text-muted-foreground">{suffix}</span>
              </p>
              {/* Reserved in the multi-column layouts so prices and buttons line up across plans. */}
              <p className={cn("mt-2 text-[12px] leading-4 text-muted-foreground sm:min-h-4", !note && "hidden sm:block")}>
                {note}
              </p>

              <Button asChild variant={paid ? "default" : "outline"} className="mt-6 w-full">
                <Link href={href}>{paid ? `Choose ${plan.label}` : "Start free"}</Link>
              </Button>

              <ul className="mt-6 space-y-2.5 border-t pt-5 text-[13px] leading-5">
                {planLines(tier).map((line) => (
                  <li key={line.text} className="flex items-start gap-2.5">
                    {line.included ? (
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-foreground" strokeWidth={2.5} />
                    ) : (
                      <Minus aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.5} />
                    )}
                    <span className={line.included ? "text-foreground/85" : "text-muted-foreground"}>{line.text}</span>
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
