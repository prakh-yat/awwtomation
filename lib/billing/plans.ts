import type { PlanTier } from "@prisma/client";

export type PlanLimits = {
  /** Connected Instagram accounts and Facebook Pages, across the organization. */
  channels: number;
  /** Workspaces (brands or clients) in the organization. */
  workspaces: number;
  automations: number;
  dmsPerMonth: number;
  /** Contacts across the organization. Past it, people who write in are still saved but no automation starts for them. */
  contacts: number;
  members: number;
  /** Broadcasts started per calendar month (UTC); 0 means the plan has no broadcasts. */
  broadcastsPerMonth: number;
  /** AI agents in one workspace. */
  aiAgentsPerWorkspace: number;
  /** Pipelines in one workspace, the starter pipeline included. */
  pipelinesPerWorkspace: number;
  /** Days of conversations, delivery logs and analytics kept (see lib/services/retention.ts). */
  historyDays: number;
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
 * Numbers are the contract from ARCHITECTURE §5: change them there first.
 *
 * There is no free tier. NONE is the state of an organization that has not
 * subscribed (or whose subscription ended): it can connect an account and
 * build automations, but nothing is sent until it picks a plan. It is never
 * shown as a plan to buy.
 */
export const PLANS: Record<PlanTier, PlanLimits> = {
  NONE: {
    channels: 1,
    workspaces: 1,
    automations: 3,
    dmsPerMonth: 0,
    contacts: 1_000,
    members: 1,
    broadcastsPerMonth: 0,
    aiAgentsPerWorkspace: 1,
    pipelinesPerWorkspace: 1,
    historyDays: 30,
    priceUsd: 0,
    priceAnnualUsd: 0,
    label: "No plan",
    description: "Set things up now; choose a plan to start sending.",
    features: [],
  },
  STARTER: {
    channels: 3,
    workspaces: 3,
    automations: 20,
    dmsPerMonth: 2_000,
    contacts: 10_000,
    members: 3,
    broadcastsPerMonth: 20,
    aiAgentsPerWorkspace: 3,
    pipelinesPerWorkspace: 3,
    historyDays: 90,
    priceUsd: 15,
    priceAnnualUsd: 144,
    label: "Starter",
    description: "For a shop with a few accounts.",
    features: ["3 connected accounts", "20 automations", "2,000 DMs a month", "10,000 contacts", "20 broadcasts a month", "90 days of history", "3 team members"],
  },
  PRO: {
    channels: 10,
    workspaces: 10,
    automations: 100,
    dmsPerMonth: 15_000,
    contacts: 50_000,
    members: 10,
    broadcastsPerMonth: 100,
    aiAgentsPerWorkspace: 10,
    pipelinesPerWorkspace: 10,
    historyDays: 180,
    priceUsd: 49,
    priceAnnualUsd: 470,
    label: "Pro",
    description: "For teams running several accounts.",
    features: ["10 connected accounts", "100 automations", "15,000 DMs a month", "50,000 contacts", "100 broadcasts a month", "180 days of history", "10 team members", "Priority support"],
  },
  AGENCY: {
    channels: 50,
    workspaces: 50,
    automations: 1_000,
    dmsPerMonth: 100_000,
    contacts: 250_000,
    members: 50,
    broadcastsPerMonth: 500,
    aiAgentsPerWorkspace: 25,
    pipelinesPerWorkspace: 20,
    historyDays: 365,
    priceUsd: 149,
    priceAnnualUsd: 1430,
    label: "Agency",
    description: "For agencies with many clients.",
    features: ["50 connected accounts", "1,000 automations", "100,000 DMs a month", "250,000 contacts", "500 broadcasts a month", "1 year of history", "50 team members", "Priority support", "Dedicated onboarding"],
  },
};

/** The plans that can be bought, in display order, for pricing tables and plan pickers. */
export const PLAN_ORDER: readonly PlanTier[] = ["STARTER", "PRO", "AGENCY"] as const;

/** Every tier from none up, for comparing one against another. */
const TIER_RANK: readonly PlanTier[] = ["NONE", "STARTER", "PRO", "AGENCY"] as const;

export function limitsFor(plan: PlanTier): PlanLimits {
  return PLANS[plan];
}

/** A plan that sends messages: any paid one. NONE builds but never sends. */
export function isLivePlan(plan: PlanTier): boolean {
  return plan !== "NONE";
}

export function hasBroadcasts(plan: PlanTier): boolean {
  return PLANS[plan].broadcastsPerMonth > 0;
}

/** "30 days", "180 days", "1 year": how long a plan keeps history, for copy. */
export function historyLabel(days: number): string {
  return days % 365 === 0 ? `${days / 365} year${days === 365 ? "" : "s"}` : `${days} days`;
}

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && value in PLANS;
}

/** Positive when `b` is a bigger plan than `a`; useful for upgrade/downgrade copy. */
export function comparePlans(a: PlanTier, b: PlanTier): number {
  return TIER_RANK.indexOf(b) - TIER_RANK.indexOf(a);
}

// ───────────────────────── Billing intervals & prices ─────────────────────────

/** Mirrors the Prisma `BillingInterval` enum without importing it into client bundles. */
export type BillingIntervalId = "MONTHLY" | "ANNUAL";

export const BILLING_INTERVALS: readonly BillingIntervalId[] = ["MONTHLY", "ANNUAL"] as const;

export function isBillingInterval(value: unknown): value is BillingIntervalId {
  return value === "MONTHLY" || value === "ANNUAL";
}

/** Tiers that have a Dodo product behind them: every tier but NONE. */
export const PURCHASABLE_PLANS: readonly PlanTier[] = ["STARTER", "PRO", "AGENCY"] as const;

export function isPurchasablePlan(tier: PlanTier): boolean {
  return PURCHASABLE_PLANS.includes(tier);
}

/** Amount charged per billing period, in USD cents (what Dodo expects). */
export function planPriceCents(tier: PlanTier, interval: BillingIntervalId): number {
  const plan = PLANS[tier];
  return (interval === "ANNUAL" ? plan.priceAnnualUsd : plan.priceUsd) * 100;
}

/** Effective monthly cost in cents: annual plans spread over 12 months, for "per month" copy. */
export function monthlyEquivalentCents(tier: PlanTier, interval: BillingIntervalId): number {
  return interval === "ANNUAL" ? Math.round(planPriceCents(tier, interval) / 12) : planPriceCents(tier, interval);
}

/** Whole-percent saving of annual vs 12 × monthly (0 for NONE). */
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
