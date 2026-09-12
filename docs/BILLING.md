# Billing (Dodo Payments)

Awwtomation sells the STARTER / PRO / AGENCY plans as recurring subscriptions through
[Dodo Payments](https://dodopayments.com) (merchant of record — Dodo handles cards, tax and
invoices). This document covers setup, how entitlements are derived, and the admin override.

Code map:

| Area | Files |
|---|---|
| Config / SDK | `lib/billing/dodo/config.ts`, `lib/billing/dodo/client.ts` |
| Wire → DB mapping, webhook verification | `lib/billing/dodo/events.ts` |
| Entitlements (effective plan, grace, service state) | `lib/billing/entitlements.ts`, consumed by `lib/billing/usage.ts` |
| Service (checkout, sync, webhooks, cancel/resume/change, portal, overview) | `lib/services/billing.ts` |
| API | `app/api/billing/{checkout,webhook,status,reconcile,portal,cancel,resume,change-plan,payments}` |
| UI | `app/checkout/*`, `app/(app)/settings/billing/page.tsx`, `components/billing/*` |
| Admin | `lib/services/admin.ts` (`setWorkspacePlan`, `clearWorkspacePlanOverride`), `app/api/admin/workspaces/[id]/plan` |
| Ops | `scripts/create-dodo-products.mjs` |

## 1. Setup

### 1.1 API key

Dodo dashboard → **Developer → API keys** → create a key. Test-mode and live-mode keys are
different; the key must match `DODO_MODE`.

```env
DODO_MODE=test            # or live
DODO_SECRET_KEY=...       # never commit; server-only
```

With no key set the app still builds and runs: Settings → Billing shows an operator notice
instead of the plan buttons, and `/checkout` renders a "Billing isn't configured yet" panel.

### 1.2 Products

Run once per mode (ids differ between test and live):

```bash
node --env-file=.env scripts/create-dodo-products.mjs
```

It lists existing recurring products, creates any of the six that are missing
(`Awwtomation Starter (Monthly)`, `Awwtomation Starter (Annual)`, … Pro, Agency), warns when an
existing product's price no longer matches `lib/billing/plans.ts`, and prints:

```env
DODO_PRODUCT_STARTER_MONTHLY=pdt_…
DODO_PRODUCT_STARTER_ANNUAL=pdt_…
DODO_PRODUCT_PRO_MONTHLY=pdt_…
DODO_PRODUCT_PRO_ANNUAL=pdt_…
DODO_PRODUCT_AGENCY_MONTHLY=pdt_…
DODO_PRODUCT_AGENCY_ANNUAL=pdt_…
```

Paste those into the environment. Prices: Starter $15/mo · $144/yr, Pro $49/mo · $470/yr,
Agency $149/mo · $1,430/yr (≈ 20 % off annually). Change them in `PLANS` first, then in the
script, then in the Dodo dashboard (the script never edits an existing product).

### 1.3 Webhook endpoint

Dodo dashboard → **Developer → Webhooks → Add endpoint**:

- URL: `https://<your-domain>/api/billing/webhook`
- Events: at minimum `subscription.*`, `payment.*`, `refund.*`, `dispute.*` (selecting all is fine —
  unknown types are stored in `BillingEvent` and ignored).
- Copy the signing secret (`whsec_…`):

```env
DODO_WEBHOOK_SECRET=whsec_...
```

The route verifies the [Standard Webhooks](https://www.standardwebhooks.com/) signature
(`webhook-id`, `webhook-timestamp`, `webhook-signature`) over the raw body *before* parsing JSON,
rejects bodies over 512 KB, and is excluded from the auth middleware. Responses: `200` for handled
or duplicate events, `401` for bad signatures, `5xx` when processing failed (Dodo retries with
backoff). Every delivery is recorded in `BillingEvent` keyed on `webhook-id`, so retries are
idempotent.

Local development: expose the dev server with a tunnel (`ngrok http 3000`, Cloudflare Tunnel) and
register the tunnel URL as a *test-mode* endpoint. Without a tunnel, checkout still completes:
the success page polls `POST /api/billing/reconcile`, which reads the subscription straight from
Dodo with your API key.

### 1.4 Test cards

In test mode use Dodo's test cards (Dashboard → Developer → Testing), e.g. `4242 4242 4242 4242`
with any future expiry and CVC for a successful payment, and the documented decline numbers to
exercise `payment.failed` / `subscription.on_hold`.

### 1.5 Going live

1. Create a live API key and live products (`DODO_MODE=live`, re-run the products script) and
   set the live `DODO_PRODUCT_*` ids.
2. Add a live webhook endpoint pointing at the production domain and set its secret.
3. Set `NEXT_PUBLIC_APP_URL` to the production origin — it builds the checkout `return_url`.
4. Production refuses to start a checkout while `DODO_MODE=test` (HTTP 503 with a detailed server
   log). Set `DODO_ALLOW_TEST_MODE_IN_PRODUCTION=true` only for a deliberate staging deploy.

## 2. Flow

```
Settings → Billing → "Upgrade to Pro"      (owner only)
   └─ /checkout?tier=PRO&interval=MONTHLY   name · email (read-only) · country · business name
        └─ POST /api/billing/checkout      → Dodo checkout session (metadata: workspace_id, plan_tier, billing_interval, user_id)
             └─ dodopayments-checkout overlay (falls back to redirecting to checkout_url)
                  └─ Dodo → return_url  /checkout/success?workspace=&tier=&interval=&payment_id=&subscription_id=&status=
                       └─ ActivationPoller: POST /api/billing/reconcile every 2 s (≤ 60 s) until serviceState ∈ {active, trialing}
Meanwhile: Dodo → POST /api/billing/webhook  subscription.active / payment.succeeded → syncSubscription / Payment row
```

`syncSubscription(id, snapshot?)` always prefers a fresh `subscriptions.retrieve` (webhooks can
arrive out of order) and falls back to the webhook payload if the API is unreachable. It is
idempotent and safe to call from webhooks, the poller and the admin panel.

### Workspace resolution (security)

A subscription is attached to a workspace in this order:

1. The workspace whose `billingSubscriptionId` already equals the subscription id (authoritative).
2. Otherwise `metadata.workspace_id` — but only if that workspace has **no other live**
   subscription (ACTIVE / TRIALING / PAST_DUE / ON_HOLD). A stray or replayed event can never
   re-point a paying workspace at someone else's subscription.

`POST /api/billing/reconcile` additionally refuses (403) when the ids resolve to a workspace other
than the caller's active one.

## 3. Entitlements

`Workspace` carries `plan`, `planSource` (DEFAULT / SUBSCRIPTION / ADMIN_OVERRIDE), `billingStatus`,
`subscribedPlan`, `billingInterval`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `billingCustomerId`,
`billingSubscriptionId`, `billingEmail`.

`effectivePlan(workspace)` (`lib/billing/entitlements.ts`) decides which limits apply:

| planSource | billingStatus | Effective plan |
|---|---|---|
| ADMIN_OVERRIDE | any | `plan` |
| SUBSCRIPTION | ACTIVE, TRIALING | `subscribedPlan` |
| SUBSCRIPTION | PAST_DUE, ON_HOLD | `subscribedPlan` for 7 days after `currentPeriodEnd` (grace), then FREE |
| SUBSCRIPTION | NONE, CANCELLED, EXPIRED | FREE |
| DEFAULT | — | `plan` (FREE for new workspaces) |

`lib/billing/usage.ts` (`reserveDmQuota`, `getUsage`, `checkLimit`, `canAdd*`, `canUseBroadcasts`)
reads limits through `effectivePlan`, so quota enforcement follows the subscription automatically.
`serviceState(workspace)` → `free | active | trialing | grace | lapsed | cancelling` feeds the
badge and copy on the billing page; `serviceStateInfo` returns the label/description/tone.

Dodo status mapping: `active → ACTIVE` (or `TRIALING` while inside `trial_period_days`),
`past_due → PAST_DUE`, `on_hold`/`paused → ON_HOLD`, `cancelled → CANCELLED`,
`expired`/`failed → EXPIRED`, `pending → NONE` (never grants access).

`syncSubscription` keeps the stored `plan` column consistent as well (tier while ACTIVE/TRIALING/
PAST_DUE/ON_HOLD, FREE once CANCELLED/EXPIRED) unless an admin override is active, so code that
still reads `workspace.plan` directly sees the right tier outside the grace-expiry edge case.

### Cancel / resume / change plan

- **Cancel** (`POST /api/billing/cancel`): sets `cancel_at_next_billing_date` on Dodo; the plan
  keeps working until `currentPeriodEnd` (state `cancelling`), then Dodo emits
  `subscription.cancelled` → FREE. `immediately: true` cancels on the spot.
- **Resume** (`POST /api/billing/resume`): clears `cancel_at_next_billing_date`.
- **Change plan** (`POST /api/billing/change-plan`): `subscriptions.changePlan` with
  `prorated_immediately` + `on_payment_failure: prevent_change`. Upgrades charge the prorated
  difference now; downgrades credit unused time to the customer's Dodo balance. Interval switches
  (monthly ↔ annual) go through the same call. If the charge fails the API answers
  `402 PAYMENT_FAILED` and the plan is unchanged.
- **Portal** (`POST /api/billing/portal`): Dodo customer portal for cards and invoices.

## 4. Admin overrides

`/admin/workspaces/[id]` → plan selector. Choosing a plan calls
`POST /api/admin/workspaces/:id/plan` → `setWorkspacePlan`, which sets `plan` **and**
`planSource = ADMIN_OVERRIDE`. From then on webhooks keep recording billing columns but leave
`plan` alone, so a comped or extended workspace can't be downgraded by a renewal event.

"Clear override" (`DELETE` on the same route → `clearWorkspacePlanOverride`) resets the source and
re-runs `syncSubscription` when a subscription exists (plan follows Dodo again) or drops the
workspace to FREE/DEFAULT otherwise. Both actions are written to the audit log
(`admin.plan_changed`, `admin.plan_override_cleared`) and shown on the workspace page's Billing card.

## 5. Troubleshooting

- **Plan not active after paying** — check `BillingEvent` rows (`error` column) and the
  `billing.*` log lines; then hit "Refresh" on the success page or `POST /api/billing/reconcile`
  with `{ subscriptionId }`. Most often the webhook secret or the product ids are wrong.
- **`billing.unknown_product`** — a subscription references a product id that isn't in
  `DODO_PRODUCT_*`; the billing columns are recorded but no plan is granted. Fix the env and reconcile.
- **`billing.subscription_workspace_mismatch`** — the resolution rule above refused to attach a
  subscription; inspect the workspace's `billingSubscriptionId` before intervening manually.
- **401 from the webhook route** — secret mismatch (test vs live endpoint) or a proxy that rewrites
  the body. The signature must be computed over the exact bytes Dodo sent.
