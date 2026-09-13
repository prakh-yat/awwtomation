import type { Organization, PlanTier, Prisma } from "@prisma/client";

import { PLANS } from "@/lib/billing/plans";

/**
 * Turns the raw billing columns on an organization into "what may its
 * workspaces use right now". Every limit check goes through `effectivePlan` so
 * a lapsed card, a scheduled cancellation or an admin override behave consistently.
 */

/** Days after a missed renewal during which the paid plan keeps working. */
export const GRACE_PERIOD_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

export type BillingFields = Pick<
  Organization,
  "plan" | "planSource" | "billingStatus" | "subscribedPlan" | "currentPeriodEnd" | "cancelAtPeriodEnd"
>;

/** Prisma `select` covering everything `effectivePlan` / `serviceState` read. */
export const BILLING_FIELDS_SELECT = {
  plan: true,
  planSource: true,
  billingStatus: true,
  subscribedPlan: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
} as const satisfies Prisma.OrganizationSelect;

export function isPaidPlan(tier: PlanTier): boolean {
  return PLANS[tier].priceUsd > 0;
}

/** End of the grace window for a missed renewal, or null when the organization isn't in one. */
export function graceEndsAt(ws: BillingFields): Date | null {
  if (ws.billingStatus !== "PAST_DUE" && ws.billingStatus !== "ON_HOLD") return null;
  if (!ws.currentPeriodEnd) return null;
  return new Date(ws.currentPeriodEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
}

export function inGracePeriod(ws: BillingFields, now = new Date()): boolean {
  const ends = graceEndsAt(ws);
  return ends !== null && now < ends;
}

/**
 * The plan whose limits apply. Admin overrides win outright; subscriptions
 * grant their tier while paying (plus a short grace after a failed renewal);
 * everything else falls back to the stored `plan` (FREE for new organizations).
 */
export function effectivePlan(ws: BillingFields, now = new Date()): PlanTier {
  if (ws.planSource === "ADMIN_OVERRIDE") return ws.plan;

  if (ws.planSource === "SUBSCRIPTION") {
    const tier = ws.subscribedPlan ?? ws.plan;
    switch (ws.billingStatus) {
      case "ACTIVE":
      case "TRIALING":
        return tier;
      case "PAST_DUE":
      case "ON_HOLD":
        return inGracePeriod(ws, now) ? tier : "FREE";
      default:
        // NONE (pending first payment), CANCELLED, EXPIRED — nothing is granted.
        return "FREE";
    }
  }

  return ws.plan;
}

export type ServiceState = "free" | "active" | "trialing" | "grace" | "lapsed" | "cancelling";

/** Human-readable summary of the service state for badges and copy. */
export function serviceState(ws: BillingFields, now = new Date()): ServiceState {
  if (ws.planSource === "ADMIN_OVERRIDE") return isPaidPlan(ws.plan) ? "active" : "free";

  if (ws.planSource === "SUBSCRIPTION") {
    switch (ws.billingStatus) {
      case "ACTIVE":
        return ws.cancelAtPeriodEnd ? "cancelling" : "active";
      case "TRIALING":
        return "trialing";
      case "PAST_DUE":
      case "ON_HOLD":
        return inGracePeriod(ws, now) ? "grace" : "lapsed";
      default:
        return "free";
    }
  }

  return isPaidPlan(ws.plan) ? "active" : "free";
}

export type ServiceTone = "neutral" | "success" | "warning" | "destructive";

export type ServiceStateInfo = {
  state: ServiceState;
  /** Short badge text, e.g. "Active", "Payment failed". */
  label: string;
  /** One sentence for the plan card. */
  description: string;
  tone: ServiceTone;
};

function shortDate(date: Date | null): string {
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
}

export function serviceStateInfo(ws: BillingFields, now = new Date()): ServiceStateInfo {
  const state = serviceState(ws, now);
  const plan = PLANS[effectivePlan(ws, now)].label;
  const subscribed = PLANS[ws.subscribedPlan ?? ws.plan].label;

  switch (state) {
    case "active":
      return {
        state,
        label: "Active",
        tone: "success",
        description:
          ws.planSource === "ADMIN_OVERRIDE"
            ? `This organization is on a custom ${plan} plan set up by our team.`
            : ws.currentPeriodEnd
              ? `Your ${plan} plan renews on ${shortDate(ws.currentPeriodEnd)}.`
              : `Your ${plan} plan is active.`,
      };
    case "trialing":
      return {
        state,
        label: "Trial",
        tone: "success",
        description: ws.currentPeriodEnd
          ? `Your ${plan} trial ends on ${shortDate(ws.currentPeriodEnd)}; the first payment is taken then.`
          : `Your ${plan} trial is active.`,
      };
    case "cancelling":
      return {
        state,
        label: `Cancels on ${shortDate(ws.currentPeriodEnd)}`,
        tone: "warning",
        description: `The ${plan} plan stays active until ${shortDate(ws.currentPeriodEnd)}, then the organization moves to Free. You can resume any time before then.`,
      };
    case "grace":
      return {
        state,
        label: `Payment failed · grace until ${shortDate(graceEndsAt(ws))}`,
        tone: "warning",
        description: `The last renewal didn't go through. ${plan} limits keep working until ${shortDate(graceEndsAt(ws))}. Update your payment method to keep them.`,
      };
    case "lapsed":
      return {
        state,
        label: "Payment failed",
        tone: "destructive",
        description: `The ${subscribed} subscription is unpaid and the grace period has ended, so Free limits apply. Update your payment method to restore it.`,
      };
    case "free":
    default:
      return {
        state: "free",
        label: "Free",
        tone: "neutral",
        description:
          ws.billingStatus === "CANCELLED" || ws.billingStatus === "EXPIRED"
            ? `Your ${subscribed} subscription has ended. Pick a plan below to upgrade again.`
            : "You're on the Free plan. Upgrade for more accounts, automations and DMs.",
      };
  }
}
