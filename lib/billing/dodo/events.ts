import type { BillingStatus, PaymentStatus, PlanTier } from "@prisma/client";
import type DodoPayments from "dodopayments";
import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { z } from "zod";

import { getWebhookSecret, resolvePlanFromProductId } from "@/lib/billing/dodo/config";
import { type BillingIntervalId, intervalLabel, PLANS } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/workspace/api";

/**
 * Pure translation layer between Dodo's wire shapes and our billing columns.
 * No database access here so the mapping is trivially testable.
 */

const DAY_MS = 24 * 3600 * 1000;

export type NormalizedSubscription = {
  externalSubscriptionId: string;
  externalCustomerId: string;
  /** From `metadata.organization_id` (or the older `workspace_id`): a hint until the caller has verified it. */
  organizationId: string | null;
  /** Null when the product id isn't one of ours (e.g. created by hand in the dashboard). */
  tier: PlanTier | null;
  interval: BillingIntervalId | null;
  status: BillingStatus;
  providerStatus: DodoPayments.SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  productId: string;
};

function metadataString(metadata: DodoPayments.Metadata | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dodo has no explicit trial status; infer it from the trial window on an active subscription. */
function isInTrial(sub: DodoPayments.Subscription, now: Date): boolean {
  if (sub.status !== "active" || !sub.trial_period_days || sub.trial_period_days <= 0) return false;
  const created = parseDate(sub.created_at);
  return created !== null && now.getTime() < created.getTime() + sub.trial_period_days * DAY_MS;
}

export function mapSubscriptionStatus(status: DodoPayments.SubscriptionStatus): BillingStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "on_hold":
    case "paused":
      return "ON_HOLD";
    case "past_due":
      return "PAST_DUE";
    case "cancelled":
      return "CANCELLED";
    case "expired":
    case "failed":
      return "EXPIRED";
    case "pending":
    default:
      // Pending = checkout started but not paid. Never grants access.
      return "NONE";
  }
}

export function normalizeSubscription(sub: DodoPayments.Subscription, now = new Date()): NormalizedSubscription {
  const resolved = resolvePlanFromProductId(sub.product_id);
  const status = isInTrial(sub, now) ? "TRIALING" : mapSubscriptionStatus(sub.status);
  return {
    externalSubscriptionId: sub.subscription_id,
    externalCustomerId: sub.customer.customer_id,
    organizationId: metadataString(sub.metadata, "organization_id") ?? metadataString(sub.metadata, "workspace_id"),
    tier: resolved?.tier ?? null,
    interval: resolved?.interval ?? null,
    status,
    providerStatus: sub.status,
    currentPeriodEnd: parseDate(sub.next_billing_date),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_next_billing_date),
    amountCents: sub.recurring_pre_tax_amount,
    currency: sub.currency,
    customerEmail: sub.customer.email || null,
    customerName: sub.customer.name || null,
    productId: sub.product_id,
  };
}

export type NormalizedPayment = {
  externalId: string;
  subscriptionId: string | null;
  /** Hint from `metadata.organization_id` (or the older `workspace_id`); the caller verifies it. */
  organizationId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  description: string;
  invoiceUrl: string | null;
  paidAt: Date | null;
  customerId: string;
  customerEmail: string | null;
};

export function mapPaymentStatus(status: DodoPayments.IntentStatus | null | undefined): PaymentStatus {
  switch (status) {
    case "succeeded":
    case "partially_captured":
    case "partially_captured_and_capturable":
      return "SUCCEEDED";
    case "failed":
    case "cancelled":
      return "FAILED";
    default:
      return "PENDING";
  }
}

function describePayment(payment: DodoPayments.Payment, fallbackTier: PlanTier | null): string {
  const tier = metadataString(payment.metadata, "plan_tier");
  const interval = metadataString(payment.metadata, "billing_interval");
  const label = tier && tier in PLANS ? PLANS[tier as PlanTier].label : fallbackTier ? PLANS[fallbackTier].label : null;
  const period = interval === "MONTHLY" || interval === "ANNUAL" ? ` · ${intervalLabel(interval)}` : "";
  if (!label) return payment.subscription_id ? "Subscription payment" : "Payment";
  return payment.retry_attempt > 0 ? `${label} plan${period} · retry` : `${label} plan${period}`;
}

/**
 * `eventType` lets refund/dispute events override the intent status, since
 * the payment object itself keeps reporting `succeeded` after a refund.
 */
export function normalizePayment(
  payment: DodoPayments.Payment,
  eventType: string,
  fallbackTier: PlanTier | null = null,
): NormalizedPayment {
  let status = mapPaymentStatus(payment.status);
  if (eventType.startsWith("refund.") && eventType !== "refund.failed") status = "REFUNDED";
  else if (payment.refund_status === "full") status = "REFUNDED";
  else if (eventType.startsWith("dispute.") || payment.disputes.length > 0) status = "DISPUTED";

  return {
    externalId: payment.payment_id,
    subscriptionId: payment.subscription_id ?? null,
    organizationId: metadataString(payment.metadata, "organization_id") ?? metadataString(payment.metadata, "workspace_id"),
    amountCents: payment.total_amount,
    currency: payment.currency,
    status,
    description: describePayment(payment, fallbackTier),
    invoiceUrl: payment.invoice_url ?? null,
    paidAt: status === "SUCCEEDED" || status === "REFUNDED" ? parseDate(payment.created_at) : null,
    customerId: payment.customer.customer_id,
    customerEmail: payment.customer.email || null,
  };
}

// ───────────────────────── Webhook parsing ─────────────────────────

const envelopeSchema = z.object({
  business_id: z.string().optional(),
  type: z.string().min(1),
  timestamp: z.string().optional(),
  data: z.object({ payload_type: z.string().optional() }).passthrough(),
});

export type ParsedWebhook = {
  /** Provider's delivery id (`webhook-id` header): stable across retries, so it's our idempotency key. */
  eventId: string;
  type: string;
  payloadType: string | null;
  timestamp: Date | null;
  data: Record<string, unknown>;
  /** The verified body, kept verbatim for the BillingEvent audit row. */
  raw: unknown;
};

export const WEBHOOK_HEADERS = ["webhook-id", "webhook-timestamp", "webhook-signature"] as const;

/**
 * Verifies the Standard Webhooks signature over the *raw* body before any JSON
 * parsing. `client.webhooks.unwrap` does exactly this internally but needs an
 * API client (secret key); using `standardwebhooks` directly keeps webhook
 * ingestion working with only the signing secret configured.
 */
export function parseWebhook(rawBody: string, headers: Headers): ParsedWebhook {
  const secret = getWebhookSecret();
  if (!secret) {
    logger.error("billing.webhook_secret_missing", { hint: "Set DODO_WEBHOOK_SECRET from Dashboard → Developer → Webhooks" });
    throw new ApiError(503, "Webhook signing secret not configured", "WEBHOOK_NOT_CONFIGURED");
  }

  const sigHeaders: Record<string, string> = {};
  for (const name of WEBHOOK_HEADERS) {
    const value = headers.get(name);
    if (!value) throw new ApiError(401, `Missing ${name} header`, "WEBHOOK_UNSIGNED");
    sigHeaders[name] = value;
  }

  try {
    new Webhook(secret).verify(rawBody, sigHeaders);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      throw new ApiError(401, "Invalid webhook signature", "WEBHOOK_INVALID_SIGNATURE");
    }
    throw err;
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, "Webhook body is not valid JSON", "WEBHOOK_BAD_JSON");
  }
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success) throw new ApiError(400, "Unexpected webhook envelope", "WEBHOOK_BAD_ENVELOPE");

  return {
    eventId: sigHeaders["webhook-id"],
    type: parsed.data.type,
    payloadType: parsed.data.data.payload_type ?? null,
    timestamp: parseDate(parsed.data.timestamp),
    data: parsed.data.data,
    raw: json,
  };
}
