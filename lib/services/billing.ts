import {
  type BillingInterval,
  type BillingStatus,
  type PaymentStatus,
  type PlanSource,
  type Organization,
  type PlanTier,
  Prisma,
} from "@prisma/client";
import type DodoPayments from "dodopayments";
import { z } from "zod";

import { getDodoClient, toBillingError } from "@/lib/billing/dodo/client";
import {
  assertBillingUsableInProduction,
  getDodoMode,
  isBillingConfigured,
  missingProductIds,
  requireProductId,
  resolvePlanFromProductId,
  type DodoMode,
} from "@/lib/billing/dodo/config";
import {
  type NormalizedPayment,
  type NormalizedSubscription,
  normalizePayment,
  normalizeSubscription,
  type ParsedWebhook,
} from "@/lib/billing/dodo/events";
import {
  BILLING_FIELDS_SELECT,
  effectivePlan,
  graceEndsAt,
  serviceStateInfo,
  type ServiceState,
  type ServiceTone,
} from "@/lib/billing/entitlements";
import {
  type BillingIntervalId,
  comparePlans,
  isPurchasablePlan,
  PLANS,
  planPriceCents,
  PURCHASABLE_PLANS,
} from "@/lib/billing/plans";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/services/audit";
import { ApiError } from "@/lib/workspace/api";

/**
 * Dodo Payments subscription lifecycle. Plans belong to organizations: every
 * function takes the organization id first and scopes its writes by it;
 * provider ids (`sub_…`, `cus_…`) are only ever trusted after they have been
 * tied to an organization through a verified webhook or an API call made with
 * our own secret key. Audit rows carry the organization id in metadata.
 */

// ───────────────────────── Schemas ─────────────────────────

const tierSchema = z.enum(["STARTER", "PRO", "AGENCY"]);
const intervalSchema = z.enum(["MONTHLY", "ANNUAL"]);

export const billingAddressSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your full name").max(120),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Choose a country"),
    state: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    street: z.string().trim().max(200).optional(),
    zipcode: z.string().trim().max(20).optional(),
    businessName: z.string().trim().max(160).optional(),
  })
  .strict();

export const checkoutSchema = z
  .object({ tier: tierSchema, interval: intervalSchema, billing: billingAddressSchema.optional() })
  .strict();

export const reconcileSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(200).optional(),
    paymentId: z.string().trim().min(1).max(200).optional(),
    subscriptionId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const CANCEL_REASONS = [
  "too_expensive",
  "missing_features",
  "switched_service",
  "unused",
  "customer_service",
  "low_quality",
  "too_complex",
  "other",
] as const satisfies readonly DodoPayments.CancellationFeedback[];

export const cancelSchema = z
  .object({
    feedback: z.enum(CANCEL_REASONS).optional(),
    comment: z.string().trim().max(500).optional(),
    immediately: z.boolean().optional(),
  })
  .strict();

export const changePlanSchema = z.object({ tier: tierSchema, interval: intervalSchema }).strict();

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CancelInput = z.infer<typeof cancelSchema>;

// ───────────────────────── Helpers ─────────────────────────

const ACTIVE_STATUSES: BillingStatus[] = ["ACTIVE", "TRIALING"];
/** Statuses where a subscription exists at the provider and must be changed, not replaced. */
const LIVE_STATUSES: BillingStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE", "ON_HOLD"];

type BillingOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "plan"
  | "planSource"
  | "billingStatus"
  | "billingInterval"
  | "billingCustomerId"
  | "billingSubscriptionId"
  | "billingEmail"
  | "currentPeriodEnd"
  | "cancelAtPeriodEnd"
  | "subscribedPlan"
>;

const ORGANIZATION_BILLING_SELECT = {
  id: true,
  name: true,
  plan: true,
  planSource: true,
  billingStatus: true,
  billingInterval: true,
  billingCustomerId: true,
  billingSubscriptionId: true,
  billingEmail: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  subscribedPlan: true,
} as const satisfies Prisma.OrganizationSelect;

async function loadOrganization(organizationId: string): Promise<BillingOrganization> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: ORGANIZATION_BILLING_SELECT });
  if (!org) throw new ApiError(404, "Organization not found", "NOT_FOUND");
  return org;
}

function requireLiveSubscription(ws: BillingOrganization): string {
  if (!ws.billingSubscriptionId || !LIVE_STATUSES.includes(ws.billingStatus)) {
    throw new ApiError(409, "This organization doesn't have an active subscription", "NO_SUBSCRIPTION");
  }
  return ws.billingSubscriptionId;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    return { unserializable: true };
  }
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Organizations created before organizations existed kept their workspace's id,
 * so a `workspace_id` hint in older Dodo metadata still names the organization.
 * Newer hints name a workspace only if someone passes one; map those too.
 */
async function loadHintedOrganization(hint: string | null): Promise<BillingOrganization | null> {
  if (!hint) return null;
  const direct = await prisma.organization.findUnique({ where: { id: hint }, select: ORGANIZATION_BILLING_SELECT });
  if (direct) return direct;
  const workspace = await prisma.workspace.findUnique({ where: { id: hint }, select: { organizationId: true } });
  return workspace ? loadOrganization(workspace.organizationId).catch(() => null) : null;
}

/**
 * Which organization a subscription belongs to. The subscription id already
 * stored on an organization is authoritative; the metadata hint is only
 * honoured when that organization has no live subscription of its own, so a
 * stray or replayed event can never re-point a paying organization at another
 * customer's subscription.
 */
async function resolveOrganizationForSubscription(sub: NormalizedSubscription): Promise<BillingOrganization | null> {
  const byId = await prisma.organization.findUnique({
    where: { billingSubscriptionId: sub.externalSubscriptionId },
    select: ORGANIZATION_BILLING_SELECT,
  });
  if (byId) return byId;

  const hinted = await loadHintedOrganization(sub.organizationId);
  if (!hinted) return null;

  const hasOtherLiveSubscription =
    hinted.billingSubscriptionId !== null &&
    hinted.billingSubscriptionId !== sub.externalSubscriptionId &&
    LIVE_STATUSES.includes(hinted.billingStatus);
  if (hasOtherLiveSubscription) {
    logger.warn("billing.subscription_organization_mismatch", {
      organizationId: hinted.id,
      existing: hinted.billingSubscriptionId,
      incoming: sub.externalSubscriptionId,
      status: sub.status,
    });
    return null;
  }
  return hinted;
}

// ───────────────────────── Subscription sync ─────────────────────────

export type SyncResult = { organizationId: string | null; status: BillingStatus; plan: PlanTier | null; applied: boolean };

/**
 * Writes a subscription snapshot onto its organization. Idempotent: applying the
 * same snapshot twice is a no-op, and applying an older snapshot after a newer
 * one only matters if the caller passes stale data (webhook handlers re-fetch
 * from the API first for exactly that reason).
 *
 * `plan` is only touched when the organization isn't under an admin override; the
 * billing columns are always recorded so the override can be lifted later.
 */
async function applySubscriptionSnapshot(sub: NormalizedSubscription): Promise<SyncResult> {
  const ws = await resolveOrganizationForSubscription(sub);
  if (!ws) {
    logger.warn("billing.subscription_unresolved", { subscriptionId: sub.externalSubscriptionId, hint: sub.organizationId });
    return { organizationId: null, status: sub.status, plan: sub.tier, applied: false };
  }

  if (!sub.tier) {
    // A product we don't know about: record the provider state but never grant a plan for it.
    logger.error("billing.unknown_product", { organizationId: ws.id, productId: sub.productId, subscriptionId: sub.externalSubscriptionId });
  }

  const override = ws.planSource === "ADMIN_OVERRIDE";
  const grants = sub.tier !== null && ACTIVE_STATUSES.includes(sub.status);
  const keepsTier = sub.tier !== null && (sub.status === "PAST_DUE" || sub.status === "ON_HOLD");
  const ended = sub.status === "CANCELLED" || sub.status === "EXPIRED";

  let plan: PlanTier = ws.plan;
  if (!override) {
    if (grants || keepsTier) plan = sub.tier as PlanTier;
    else if (ended) plan = "NONE";
    // NONE (pending) leaves the current plan alone.
  }

  let planSource: PlanSource = ws.planSource;
  if (!override && sub.status !== "NONE") planSource = "SUBSCRIPTION";

  const interval: BillingInterval | null = sub.interval ?? ws.billingInterval;

  await prisma.organization.update({
    where: { id: ws.id },
    data: {
      plan,
      planSource,
      billingStatus: sub.status,
      billingInterval: interval,
      billingCustomerId: sub.externalCustomerId,
      billingSubscriptionId: sub.externalSubscriptionId,
      billingEmail: sub.customerEmail ?? ws.billingEmail,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      subscribedPlan: sub.tier ?? ws.subscribedPlan,
    },
  });

  if (ws.billingStatus !== sub.status || ws.plan !== plan || ws.cancelAtPeriodEnd !== sub.cancelAtPeriodEnd) {
    logger.info("billing.subscription_synced", {
      organizationId: ws.id,
      subscriptionId: sub.externalSubscriptionId,
      from: { status: ws.billingStatus, plan: ws.plan },
      to: { status: sub.status, plan, provider: sub.providerStatus },
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    });
  }
  return { organizationId: ws.id, status: sub.status, plan, applied: true };
}

/**
 * Pulls the latest subscription state from Dodo and applies it. `snapshot`
 * (typically a webhook payload) is used as a fallback when the API is
 * unreachable so an outage never leaves a paid organization un-activated.
 */
export async function syncSubscription(
  externalSubscriptionId: string,
  snapshot?: DodoPayments.Subscription,
): Promise<SyncResult> {
  let sub = snapshot;
  if (isBillingConfigured()) {
    try {
      sub = await getDodoClient().subscriptions.retrieve(externalSubscriptionId);
    } catch (err) {
      if (!snapshot) throw toBillingError(err, "subscriptions.retrieve");
      logger.warn("billing.subscription_refetch_failed", { subscriptionId: externalSubscriptionId, error: err instanceof Error ? err.message : String(err) });
    }
  } else if (!snapshot) {
    throw new ApiError(503, "Billing isn't configured yet", "BILLING_NOT_CONFIGURED");
  }
  return applySubscriptionSnapshot(normalizeSubscription(sub as DodoPayments.Subscription));
}

// ───────────────────────── Payments ─────────────────────────

async function resolveOrganizationForPayment(payment: NormalizedPayment): Promise<BillingOrganization | null> {
  if (payment.subscriptionId) {
    const bySub = await prisma.organization.findUnique({
      where: { billingSubscriptionId: payment.subscriptionId },
      select: ORGANIZATION_BILLING_SELECT,
    });
    if (bySub) return bySub;
  }
  const hinted = await loadHintedOrganization(payment.organizationId);
  if (!hinted) return null;
  // Same rule as subscriptions: an organization paying for a different live subscription doesn't get someone else's receipts.
  const foreign =
    payment.subscriptionId !== null &&
    hinted.billingSubscriptionId !== null &&
    hinted.billingSubscriptionId !== payment.subscriptionId &&
    LIVE_STATUSES.includes(hinted.billingStatus);
  if (foreign) {
    logger.warn("billing.payment_organization_mismatch", { organizationId: hinted.id, paymentId: payment.externalId });
    return null;
  }
  return hinted;
}

async function upsertPayment(payment: NormalizedPayment, organizationId: string): Promise<void> {
  await prisma.payment.upsert({
    where: { externalId: payment.externalId },
    create: {
      organizationId,
      externalId: payment.externalId,
      subscriptionId: payment.subscriptionId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      description: payment.description,
      invoiceUrl: payment.invoiceUrl,
      paidAt: payment.paidAt,
    },
    update: {
      // Never move a payment between organizations; only its state and links may change.
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      subscriptionId: payment.subscriptionId,
      description: payment.description,
      invoiceUrl: payment.invoiceUrl ?? undefined,
      paidAt: payment.paidAt ?? undefined,
    },
  });
}

async function recordPayment(raw: DodoPayments.Payment, eventType: string): Promise<boolean> {
  const draft = normalizePayment(raw, eventType);
  const ws = await resolveOrganizationForPayment(draft);
  if (!ws) {
    logger.warn("billing.payment_unresolved", { paymentId: raw.payment_id, subscriptionId: raw.subscription_id ?? null });
    return false;
  }
  const payment = normalizePayment(raw, eventType, ws.subscribedPlan);
  await upsertPayment(payment, ws.id);
  if (payment.customerId && !ws.billingCustomerId) {
    await prisma.organization.update({ where: { id: ws.id }, data: { billingCustomerId: payment.customerId } });
  }
  return true;
}

/** Refund/dispute events reference a payment we already stored; update its status in place. */
async function markPaymentStatus(paymentId: string, status: PaymentStatus): Promise<boolean> {
  const result = await prisma.payment.updateMany({ where: { externalId: paymentId }, data: { status } });
  return result.count > 0;
}

// ───────────────────────── Webhooks ─────────────────────────

export type WebhookOutcome = { eventId: string; type: string; duplicate: boolean; handled: boolean };

/**
 * Applies one verified webhook. The BillingEvent row is written first so a
 * redelivery of an event we already processed is a cheap no-op; an event that
 * failed mid-way keeps `processedAt` null and is retried on the next delivery.
 * Errors propagate so the route can answer 5xx and Dodo re-sends.
 */
export async function applyWebhookEvent(event: ParsedWebhook): Promise<WebhookOutcome> {
  const receipt = await prisma.billingEvent.upsert({
    where: { eventId: event.eventId },
    create: { provider: "dodo", eventId: event.eventId, type: event.type, payload: toJson(event.raw) },
    update: {},
    select: { processedAt: true },
  });
  if (receipt.processedAt) return { eventId: event.eventId, type: event.type, duplicate: true, handled: false };

  try {
    const handled = await dispatchWebhook(event);
    await prisma.billingEvent.update({ where: { eventId: event.eventId }, data: { processedAt: new Date(), error: null } });
    return { eventId: event.eventId, type: event.type, duplicate: false, handled };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.billingEvent
      .update({ where: { eventId: event.eventId }, data: { error: message.slice(0, 1000) } })
      .catch((e: unknown) => logger.error("billing.webhook_error_write_failed", { eventId: event.eventId, error: e }));
    logger.error("billing.webhook_failed", { eventId: event.eventId, type: event.type, error: err });
    throw err;
  }
}

async function dispatchWebhook(event: ParsedWebhook): Promise<boolean> {
  switch (event.payloadType) {
    case "Subscription": {
      const sub = event.data as unknown as DodoPayments.Subscription;
      if (typeof sub.subscription_id !== "string") throw new ApiError(400, "Subscription payload missing subscription_id");
      const result = await syncSubscription(sub.subscription_id, sub);
      return result.applied;
    }
    case "Payment": {
      const payment = event.data as unknown as DodoPayments.Payment;
      if (typeof payment.payment_id !== "string") throw new ApiError(400, "Payment payload missing payment_id");
      return recordPayment(payment, event.type);
    }
    case "Refund": {
      const refund = event.data as unknown as DodoPayments.Refund;
      if (refund.status !== "succeeded") return false;
      return markPaymentStatus(refund.payment_id, "REFUNDED");
    }
    case "Dispute": {
      const dispute = event.data as unknown as DodoPayments.GetDispute;
      // A dispute that resolves in our favour restores the original receipt state.
      const won = event.type === "dispute.won" || event.type === "dispute.cancelled" || event.type === "dispute.expired";
      return markPaymentStatus(dispute.payment_id, won ? "SUCCEEDED" : "DISPUTED");
    }
    default:
      // Payouts, license keys, credits…: recorded in BillingEvent for the audit trail, nothing to apply.
      logger.info("billing.webhook_ignored", { type: event.type, payloadType: event.payloadType });
      return false;
  }
}

// ───────────────────────── Checkout ─────────────────────────

export type StartCheckoutInput = {
  organizationId: string;
  userId: string;
  email: string;
  name: string | null;
  tier: PlanTier;
  interval: BillingIntervalId;
  billing?: z.infer<typeof billingAddressSchema>;
};

export type CheckoutSessionResult = { checkoutUrl: string; sessionId: string; mode: DodoMode };

export async function startCheckout(input: StartCheckoutInput): Promise<CheckoutSessionResult> {
  assertBillingUsableInProduction();
  if (!isPurchasablePlan(input.tier)) throw new ApiError(422, "That plan can't be purchased", "PLAN_NOT_PURCHASABLE");
  const productId = requireProductId(input.tier, input.interval);

  const ws = await loadOrganization(input.organizationId);
  if (ws.billingSubscriptionId && LIVE_STATUSES.includes(ws.billingStatus)) {
    throw new ApiError(
      409,
      ACTIVE_STATUSES.includes(ws.billingStatus)
        ? "This organization already has a plan. Change it from Settings, then Billing."
        : "This organization has an unpaid plan. Update the payment method from Settings, then Billing.",
      "ALREADY_SUBSCRIBED",
    );
  }

  const customerName = input.billing?.name ?? input.name ?? input.email;
  const params: DodoPayments.CheckoutSessionCreateParams = {
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: ws.billingCustomerId ? { customer_id: ws.billingCustomerId } : { email: input.email, name: customerName },
    return_url: appUrl(`/checkout/success?organization=${ws.id}&tier=${input.tier}&interval=${input.interval}`),
    cancel_url: appUrl(`/checkout?tier=${input.tier}&interval=${input.interval}`),
    metadata: { organization_id: ws.id, plan_tier: input.tier, billing_interval: input.interval, user_id: input.userId },
    show_saved_payment_methods: true,
    customization: { theme: "light", show_on_demand_tag: false },
    // Straight back to our success page: Dodo's own status screen shows the business's primary brand, not ours.
    feature_flags: { allow_discount_code: true, allow_tax_id: true, redirect_immediately: true },
  };
  if (input.billing) {
    params.billing_address = {
      country: input.billing.country as DodoPayments.CountryCode,
      state: input.billing.state || null,
      city: input.billing.city || null,
      street: input.billing.street || null,
      zipcode: input.billing.zipcode || null,
    };
    if (input.billing.businessName) params.customer_business_name = input.billing.businessName;
  } else {
    params.minimal_address = true;
  }

  let session: DodoPayments.CheckoutSessionResponse;
  try {
    session = await getDodoClient().checkoutSessions.create(params);
  } catch (err) {
    throw toBillingError(err, "checkoutSessions.create");
  }
  if (!session.checkout_url) {
    logger.error("billing.checkout_url_missing", { sessionId: session.session_id });
    throw new ApiError(502, "The billing provider didn't return a checkout link", "BILLING_UNAVAILABLE");
  }

  await prisma.organization.update({ where: { id: ws.id }, data: { billingEmail: input.email } });
  await recordAudit({
    userId: input.userId,
    action: "billing.checkout_started",
    targetType: "checkout_session",
    targetId: session.session_id,
    metadata: { organizationId: ws.id, tier: input.tier, interval: input.interval },
  });
  logger.info("billing.checkout_started", { organizationId: ws.id, sessionId: session.session_id, tier: input.tier, interval: input.interval });

  return { checkoutUrl: session.checkout_url, sessionId: session.session_id, mode: getDodoMode() };
}

/**
 * Used by the post-checkout poller. Webhooks normally activate the plan within
 * seconds; this pulls the same state directly so the success page doesn't
 * depend on webhook delivery (local dev without a tunnel, delayed retries).
 * Any of the ids Dodo appends to the return URL is enough to find the subscription.
 */
export async function reconcileCheckoutSession(
  organizationId: string,
  ids: { sessionId?: string; paymentId?: string; subscriptionId?: string },
): Promise<BillingOverview> {
  const ws = await loadOrganization(organizationId);

  if (isBillingConfigured()) {
    const client = getDodoClient();
    let subscriptionId = ids.subscriptionId ?? null;
    let paymentId = ids.paymentId ?? null;

    try {
      if (!subscriptionId && !paymentId && ids.sessionId) {
        const session = await client.checkoutSessions.retrieve(ids.sessionId);
        paymentId = session.payment_id ?? null;
      }
      if (!subscriptionId && paymentId) {
        const payment = await client.payments.retrieve(paymentId);
        subscriptionId = payment.subscription_id ?? null;
        await recordPayment(payment, payment.status === "succeeded" ? "payment.succeeded" : "payment.processing");
      }
      if (!subscriptionId && ws.billingSubscriptionId) subscriptionId = ws.billingSubscriptionId;

      if (subscriptionId) {
        const result = await syncSubscription(subscriptionId);
        // The caller's organization must be the one the subscription resolved to: never activate a stranger's.
        if (result.applied && result.organizationId !== organizationId) {
          logger.warn("billing.reconcile_organization_mismatch", { organizationId, resolved: result.organizationId, subscriptionId });
          throw new ApiError(403, "That subscription belongs to a different organization", "FORBIDDEN");
        }
      }
    } catch (err) {
      throw toBillingError(err, "reconcileCheckoutSession");
    }
  }

  return getBillingOverview(organizationId);
}

// ───────────────────────── Subscription changes ─────────────────────────

export async function cancelSubscription(organizationId: string, actorId: string, input: CancelInput): Promise<BillingOverview> {
  const ws = await loadOrganization(organizationId);
  const subscriptionId = requireLiveSubscription(ws);
  if (ws.cancelAtPeriodEnd && !input.immediately) {
    throw new ApiError(409, "This subscription is already set to cancel at the end of the period", "ALREADY_CANCELLING");
  }

  const params: DodoPayments.SubscriptionUpdateParams = input.immediately
    ? { status: "cancelled", cancel_reason: "cancelled_by_customer" }
    : { cancel_at_next_billing_date: true };
  if (input.feedback) params.cancellation_feedback = input.feedback;
  if (input.comment) params.cancellation_comment = input.comment;

  let updated: DodoPayments.Subscription;
  try {
    updated = await getDodoClient().subscriptions.update(subscriptionId, params);
  } catch (err) {
    throw toBillingError(err, "subscriptions.update:cancel");
  }
  await applySubscriptionSnapshot(normalizeSubscription(updated));
  await recordAudit({
    userId: actorId,
    action: input.immediately ? "billing.subscription_cancelled" : "billing.cancellation_scheduled",
    targetType: "subscription",
    targetId: subscriptionId,
    metadata: { organizationId, feedback: input.feedback ?? null, periodEnd: iso(updated.next_billing_date ? new Date(updated.next_billing_date) : null) },
  });
  return getBillingOverview(organizationId);
}

export async function resumeSubscription(organizationId: string, actorId: string): Promise<BillingOverview> {
  const ws = await loadOrganization(organizationId);
  const subscriptionId = requireLiveSubscription(ws);
  if (!ws.cancelAtPeriodEnd) throw new ApiError(409, "This subscription isn't scheduled to cancel", "NOT_CANCELLING");

  let updated: DodoPayments.Subscription;
  try {
    updated = await getDodoClient().subscriptions.update(subscriptionId, { cancel_at_next_billing_date: false });
  } catch (err) {
    throw toBillingError(err, "subscriptions.update:resume");
  }
  await applySubscriptionSnapshot(normalizeSubscription(updated));
  await recordAudit({ userId: actorId, action: "billing.cancellation_reverted", targetType: "subscription", targetId: subscriptionId, metadata: { organizationId } });
  return getBillingOverview(organizationId);
}

/**
 * Switches the subscription's product. Every change is applied immediately
 * with `prorated_immediately`: upgrades charge the prorated difference now,
 * downgrades credit the unused remainder to the customer's Dodo balance. A
 * failed upgrade charge keeps the current plan (`prevent_change`) and is
 * reported as 402 so the UI can send the customer to the portal.
 */
export async function changePlan(
  organizationId: string,
  actorId: string,
  tier: PlanTier,
  interval: BillingIntervalId,
): Promise<BillingOverview> {
  assertBillingUsableInProduction();
  if (!isPurchasablePlan(tier)) throw new ApiError(422, "That plan can't be purchased", "PLAN_NOT_PURCHASABLE");
  const productId = requireProductId(tier, interval);

  const ws = await loadOrganization(organizationId);
  const subscriptionId = requireLiveSubscription(ws);
  if (!ACTIVE_STATUSES.includes(ws.billingStatus)) {
    throw new ApiError(409, "Settle the outstanding payment before changing plans", "SUBSCRIPTION_UNPAID");
  }
  if (ws.subscribedPlan === tier && ws.billingInterval === interval) {
    throw new ApiError(409, "The organization is already on that plan", "SAME_PLAN");
  }

  const client = getDodoClient();
  let after: DodoPayments.Subscription;
  try {
    await client.subscriptions.changePlan(subscriptionId, {
      product_id: productId,
      quantity: 1,
      proration_billing_mode: "prorated_immediately",
      effective_at: "immediately",
      on_payment_failure: "prevent_change",
      metadata: { organization_id: ws.id, plan_tier: tier, billing_interval: interval, user_id: actorId },
    });
    after = await client.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    throw toBillingError(err, "subscriptions.changePlan");
  }

  await applySubscriptionSnapshot(normalizeSubscription(after));
  const landed = resolvePlanFromProductId(after.product_id);
  const upgraded = ws.subscribedPlan ? comparePlans(ws.subscribedPlan, tier) > 0 : true;
  await recordAudit({
    userId: actorId,
    action: "billing.plan_changed",
    targetType: "subscription",
    targetId: subscriptionId,
    metadata: {
      organizationId,
      from: { tier: ws.subscribedPlan, interval: ws.billingInterval },
      to: { tier, interval },
      applied: landed?.tier === tier && landed.interval === interval,
      upgrade: upgraded,
    },
  });

  if (!landed || landed.tier !== tier || landed.interval !== interval) {
    throw new ApiError(
      402,
      "The plan change couldn't be charged to your payment method. Update your card and try again.",
      "PAYMENT_FAILED",
    );
  }
  return getBillingOverview(organizationId);
}

export async function customerPortalUrl(organizationId: string): Promise<string> {
  const ws = await loadOrganization(organizationId);
  if (!ws.billingCustomerId) throw new ApiError(409, "There are no invoices yet. Choose a paid plan first.", "NO_CUSTOMER");
  try {
    const session = await getDodoClient().customers.customerPortal.create(ws.billingCustomerId, {
      return_url: appUrl("/settings/billing"),
    });
    return session.link;
  } catch (err) {
    throw toBillingError(err, "customers.customerPortal.create");
  }
}

// ───────────────────────── Read models ─────────────────────────

export type PaymentRow = {
  id: string;
  externalId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  description: string | null;
  invoiceUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

export async function listPayments(organizationId: string, limit = 50): Promise<PaymentRow[]> {
  const rows = await prisma.payment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((p) => ({
    id: p.id,
    externalId: p.externalId,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    description: p.description,
    invoiceUrl: p.invoiceUrl,
    paidAt: iso(p.paidAt),
    createdAt: p.createdAt.toISOString(),
  }));
}

export type BillingOverview = {
  /** Stored plan column (what admins see/override). */
  plan: PlanTier;
  planSource: PlanSource;
  /** Plan whose limits apply right now. */
  effectivePlan: PlanTier;
  subscribedPlan: PlanTier | null;
  serviceState: ServiceState;
  serviceLabel: string;
  serviceDescription: string;
  serviceTone: ServiceTone;
  billingStatus: BillingStatus;
  interval: BillingIntervalId | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Recurring amount for the subscribed plan/interval, from our price table. */
  amountCents: number | null;
  customerEmail: string | null;
  hasSubscription: boolean;
  hasCustomer: boolean;
  configured: boolean;
  mode: DodoMode;
  /** Plan/interval pairs that can't be bought right now, e.g. "PRO_ANNUAL". Never env var names: this reaches the browser. */
  unavailablePlans: string[];
};

export async function getBillingOverview(organizationId: string): Promise<BillingOverview> {
  const ws = await loadOrganization(organizationId);
  const info = serviceStateInfo(ws);
  const interval = ws.billingInterval;
  const subscribed = ws.subscribedPlan;
  return {
    plan: ws.plan,
    planSource: ws.planSource,
    effectivePlan: effectivePlan(ws),
    subscribedPlan: subscribed,
    serviceState: info.state,
    serviceLabel: info.label,
    serviceDescription: info.description,
    serviceTone: info.tone,
    billingStatus: ws.billingStatus,
    interval,
    currentPeriodEnd: iso(ws.currentPeriodEnd),
    graceEndsAt: iso(graceEndsAt(ws)),
    cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
    amountCents: subscribed && interval && LIVE_STATUSES.includes(ws.billingStatus) ? planPriceCents(subscribed, interval) : null,
    customerEmail: ws.billingEmail,
    hasSubscription: ws.billingSubscriptionId !== null && LIVE_STATUSES.includes(ws.billingStatus),
    hasCustomer: ws.billingCustomerId !== null,
    configured: isBillingConfigured(),
    mode: getDodoMode(),
    unavailablePlans: missingProductIds().map((name) => name.replace(/^DODO_PRODUCT_/, "")),
  };
}

/** Re-exported so route handlers and pages don't import plan internals just for the list. */
export { BILLING_FIELDS_SELECT, PURCHASABLE_PLANS, PLANS };
