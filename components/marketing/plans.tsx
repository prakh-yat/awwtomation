import * as React from "react";
import type { PlanTier } from "@prisma/client";
import { Check, Minus } from "lucide-react";

import { PLANS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/*
 * Plan helpers shared by the landing page (a server component) and the
 * pricing components (client components). Kept out of any "use client" file:
 * a server component that imports a value from one gets a reference, not the
 * value.
 */

/** The plan the pricing pages pick out as a yellow block, as the site does. */
export const RECOMMENDED_PLAN: PlanTier = "STARTER";

export const count = (n: number) => n.toLocaleString("en-US");
export const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** Service extras on top of the limits, matching the plan copy in lib/billing/plans.ts. */
const EXTRAS: Partial<Record<PlanTier, string[]>> = {
  PRO: ["Priority support"],
  AGENCY: ["Priority support", "Dedicated onboarding"],
};

export type PlanLine = { text: string; included: boolean };

/** What a plan card lists. Each limit appears exactly once per plan. */
export function planLines(tier: PlanTier): PlanLine[] {
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

/**
 * A small square tick (or dash) for plan lists and comparison tables. Pass
 * `label` where the tick is the only thing saying whether something is
 * included; leave it out when the text beside it already says so.
 */
export function Tick({ included, label, className }: { included: boolean; label?: string; className?: string }) {
  const Icon = included ? Check : Minus;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[6px]",
        included ? "bg-green text-white" : "bg-ink/10 text-ink/60",
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={3} />
    </span>
  );
}
