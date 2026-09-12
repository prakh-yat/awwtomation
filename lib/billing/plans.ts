import type { PlanTier } from "@prisma/client";

export type PlanLimits = {
  channels: number;
  automations: number;
  dmsPerMonth: number;
  members: number;
  broadcasts: boolean;
  /** Monthly price in whole dollars (0 for the free tier). */
  priceUsd: number;
  /** Price per year in whole dollars when billed annually (≈ 20% off 12 × monthly). */
  priceAnnualUsd: number;
  label: string;
  description: string;
  features: string[];
};

/**
 * Plan matrix. Limits are enforced server-side in `lib/billing/usage.ts`;
 * the copy here feeds the pricing page and the billing settings screen.
 * Numbers are the contract from ARCHITECTURE §5 — change them there first.
 */
export const PLANS: Record<PlanTier, PlanLimits> = {
  FREE: {
    channels: 1,
    automations: 3,
    dmsPerMonth: 100,
    members: 1,
    broadcasts: false,
    priceUsd: 0,
    priceAnnualUsd: 0,
    label: "Free",
    description: "Try comment-to-DM automation on one account.",
    features: [
      "1 connected Instagram or Facebook account",
      "3 automations",
      "100 DMs per month",
      "Comment, DM and story-reply triggers",
      "Unified inbox",
      "Tracked links with click counts",
    ],
  },
  STARTER: {
    channels: 3,
    automations: 20,
    dmsPerMonth: 2_000,
    members: 3,
    broadcasts: true,
    priceUsd: 15,
    priceAnnualUsd: 144,
    label: "Starter",
    description: "For creators and small brands growing on autopilot.",
    features: [
      "3 connected accounts",
      "20 automations",
      "2,000 DMs per month",
      "3 team members",
      "Broadcasts to tagged audiences",
      "Follow-to-unlock gates",
      "Contact tags and custom fields",
    ],
  },
  PRO: {
    channels: 10,
    automations: 100,
    dmsPerMonth: 15_000,
    members: 10,
    broadcasts: true,
    priceUsd: 49,
    priceAnnualUsd: 470,
    label: "Pro",
    description: "For teams running campaigns across several accounts.",
    features: [
      "10 connected accounts",
      "100 automations",
      "15,000 DMs per month",
      "10 team members",
      "Broadcasts and scheduled sends",
      "Per-automation analytics",
      "Priority support",
    ],
  },
  AGENCY: {
    channels: 50,
    automations: 1_000,
    dmsPerMonth: 100_000,
    members: 50,
    broadcasts: true,
    priceUsd: 149,
    priceAnnualUsd: 1430,
    label: "Agency",
    description: "For agencies managing many client accounts.",
    features: [
      "50 connected accounts",
      "1,000 automations",
      "100,000 DMs per month",
      "50 team members",
      "Everything in Pro",
      "Dedicated onboarding",
    ],
  },
};

/** Display order for pricing tables and plan pickers. */
export const PLAN_ORDER: readonly PlanTier[] = ["FREE", "STARTER", "PRO", "AGENCY"] as const;

export function limitsFor(plan: PlanTier): PlanLimits {
  return PLANS[plan];
}

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && value in PLANS;
}

/** Positive when `b` is a bigger plan than `a`; useful for upgrade/downgrade copy. */
export function comparePlans(a: PlanTier, b: PlanTier): number {
  return PLAN_ORDER.indexOf(b) - PLAN_ORDER.indexOf(a);
}

// ───────────────────────── Billing intervals & prices ─────────────────────────

/** Mirrors the Prisma `BillingInterval` enum without importing it into client bundles. */
export type BillingIntervalId = "MONTHLY" | "ANNUAL";

export const BILLING_INTERVALS: readonly BillingIntervalId[] = ["MONTHLY", "ANNUAL"] as const;

export function isBillingInterval(value: unknown): value is BillingIntervalId {
  return value === "MONTHLY" || value === "ANNUAL";
}

/** Tiers that have a Dodo product behind them. FREE is never checked out. */
export const PURCHASABLE_PLANS: readonly PlanTier[] = ["STARTER", "PRO", "AGENCY"] as const;

export function isPurchasablePlan(tier: PlanTier): boolean {
  return PURCHASABLE_PLANS.includes(tier);
}

/** Amount charged per billing period, in USD cents (what Dodo expects). */
export function planPriceCents(tier: PlanTier, interval: BillingIntervalId): number {
  const plan = PLANS[tier];
  return (interval === "ANNUAL" ? plan.priceAnnualUsd : plan.priceUsd) * 100;
}

/** Effective monthly cost in cents — annual plans spread over 12 months, for "per month" copy. */
export function monthlyEquivalentCents(tier: PlanTier, interval: BillingIntervalId): number {
  return interval === "ANNUAL" ? Math.round(planPriceCents(tier, interval) / 12) : planPriceCents(tier, interval);
}

/** Whole-percent saving of annual vs 12 × monthly (0 for FREE). */
export function annualSavingsPercent(tier: PlanTier): number {
  const plan = PLANS[tier];
  if (plan.priceUsd === 0) return 0;
  return Math.round((1 - plan.priceAnnualUsd / (plan.priceUsd * 12)) * 100);
}

export function intervalLabel(interval: BillingIntervalId): string {
  return interval === "ANNUAL" ? "Annual" : "Monthly";
}

/** "/month" or "/year" suffix for price displays. */
export function intervalSuffix(interval: BillingIntervalId): string {
  return interval === "ANNUAL" ? "/year" : "/month";
}

/** Cents → "$15" or "$12.50"; whole dollars drop the decimals to match the pricing page. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}
