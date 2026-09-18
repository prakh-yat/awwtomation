import type { PlanTier } from "@prisma/client";

import { type BillingIntervalId, PURCHASABLE_PLANS, BILLING_INTERVALS } from "@/lib/billing/plans";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/workspace/api";

/**
 * Dodo Payments configuration, read lazily from the environment so `next build`
 * and the worker boot without billing secrets. Nothing here ever returns the
 * secret key to a caller other than the SDK client factory.
 */

export type DodoMode = "test" | "live";

export function getDodoMode(): DodoMode {
  return optionalEnv("DODO_MODE") === "live" ? "live" : "test";
}

export function getSecretKey(): string | undefined {
  const key = optionalEnv("DODO_SECRET_KEY")?.trim();
  return key ? key : undefined;
}

export function getWebhookSecret(): string | undefined {
  const secret = optionalEnv("DODO_WEBHOOK_SECRET")?.trim();
  return secret ? secret : undefined;
}

/** True once an API key is present: the minimum for checkout to work. */
export function isBillingConfigured(): boolean {
  return Boolean(getSecretKey());
}

/**
 * Refuses to start a checkout in production while pointing at the test
 * environment, unless the operator opted in explicitly. The user-facing
 * message stays generic; the actionable detail goes to the server log only.
 */
export function assertBillingUsableInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (getDodoMode() === "live") return;
  if (optionalEnv("DODO_ALLOW_TEST_MODE_IN_PRODUCTION") === "true") return;
  logger.error("billing.test_mode_in_production", {
    hint: "DODO_MODE=test on a production deploy. Set DODO_MODE=live (with a live key) or DODO_ALLOW_TEST_MODE_IN_PRODUCTION=true to proceed intentionally.",
  });
  throw new ApiError(503, "Billing is temporarily unavailable", "BILLING_MISCONFIGURED");
}

export type ProductEnvName =
  | "DODO_PRODUCT_STARTER_MONTHLY"
  | "DODO_PRODUCT_STARTER_ANNUAL"
  | "DODO_PRODUCT_PRO_MONTHLY"
  | "DODO_PRODUCT_PRO_ANNUAL"
  | "DODO_PRODUCT_AGENCY_MONTHLY"
  | "DODO_PRODUCT_AGENCY_ANNUAL";

export function productEnvName(tier: PlanTier, interval: BillingIntervalId): ProductEnvName {
  return `DODO_PRODUCT_${tier}_${interval}` as ProductEnvName;
}

export function resolveProductId(tier: PlanTier, interval: BillingIntervalId): string | undefined {
  if (!PURCHASABLE_PLANS.includes(tier)) return undefined;
  const id = optionalEnv(productEnvName(tier, interval))?.trim();
  return id ? id : undefined;
}

/** Like `resolveProductId` but fails the request cleanly when the operator hasn't created the product. */
export function requireProductId(tier: PlanTier, interval: BillingIntervalId): string {
  const id = resolveProductId(tier, interval);
  if (id) return id;
  logger.error("billing.product_not_configured", { env: productEnvName(tier, interval) });
  throw new ApiError(503, "This plan isn't available for purchase yet", "PLAN_NOT_CONFIGURED");
}

export type ResolvedPlan = { tier: PlanTier; interval: BillingIntervalId };

/** Reverse lookup used when a subscription/webhook tells us which product was bought. */
export function resolvePlanFromProductId(productId: string | null | undefined): ResolvedPlan | null {
  if (!productId) return null;
  for (const tier of PURCHASABLE_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (resolveProductId(tier, interval) === productId) return { tier, interval };
    }
  }
  return null;
}

/** Env var names still unset: surfaced on the billing page for operators. */
export function missingProductIds(): ProductEnvName[] {
  const missing: ProductEnvName[] = [];
  for (const tier of PURCHASABLE_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (!resolveProductId(tier, interval)) missing.push(productEnvName(tier, interval));
    }
  }
  return missing;
}
