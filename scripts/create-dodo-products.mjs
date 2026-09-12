/**
 * Creates the six recurring Dodo Payments products (3 paid plans × monthly/annual)
 * and prints the DODO_PRODUCT_* lines for your .env. Idempotent: products are
 * matched by name ("Awwtomation <Plan> (Monthly|Annual)") and only created when
 * missing, so it is safe to re-run after adding a plan.
 *
 *   node --env-file=.env scripts/create-dodo-products.mjs
 *
 * Reads DODO_SECRET_KEY and DODO_MODE (test|live). Product ids differ between
 * test and live mode — run it once per mode and keep the env files separate.
 *
 * Prices mirror lib/billing/plans.ts (PLANS[tier].priceUsd / priceAnnualUsd).
 * If you change a price there, change it here too; the script warns when an
 * existing product's price no longer matches instead of silently editing it.
 */
import DodoPayments from "dodopayments";

const BRAND = "Awwtomation";
const PLANS = [
  { tier: "STARTER", label: "Starter", monthlyUsd: 15, annualUsd: 144, description: "For creators and small brands growing on autopilot." },
  { tier: "PRO", label: "Pro", monthlyUsd: 49, annualUsd: 470, description: "For teams running campaigns across several accounts." },
  { tier: "AGENCY", label: "Agency", monthlyUsd: 149, annualUsd: 1430, description: "For agencies managing many client accounts." },
];
const INTERVALS = [
  { id: "MONTHLY", label: "Monthly", interval: "Month" },
  { id: "ANNUAL", label: "Annual", interval: "Year" },
];

const secret = process.env.DODO_SECRET_KEY?.trim();
const mode = process.env.DODO_MODE === "live" ? "live" : "test";
if (!secret) {
  console.error("DODO_SECRET_KEY is not set. Add it to .env (Dashboard → Developer → API keys) and re-run.");
  process.exit(1);
}

const client = new DodoPayments({
  bearerToken: secret,
  environment: mode === "live" ? "live_mode" : "test_mode",
  timeout: 20_000,
  maxRetries: 2,
  logLevel: "off",
});

function productName(plan, interval) {
  return `${BRAND} ${plan.label} (${interval.label})`;
}

function priceCents(plan, interval) {
  return (interval.id === "ANNUAL" ? plan.annualUsd : plan.monthlyUsd) * 100;
}

async function listExisting() {
  const byName = new Map();
  for await (const product of client.products.list({ recurring: true, archived: false })) {
    if (product.name) byName.set(product.name, product);
  }
  return byName;
}

async function main() {
  console.error(`Dodo Payments · ${mode} mode`);
  const existing = await listExisting();
  const envLines = [];
  const warnings = [];

  for (const plan of PLANS) {
    for (const interval of INTERVALS) {
      const name = productName(plan, interval);
      const cents = priceCents(plan, interval);
      let product = existing.get(name);

      if (product) {
        const current = product.price?.price ?? product.price;
        if (typeof current === "number" && current !== cents) {
          warnings.push(`${name}: existing price ${current / 100} USD ≠ ${cents / 100} USD in plans.ts (edit it in the dashboard or archive and re-run)`);
        }
        console.error(`✓ exists   ${name} → ${product.product_id}`);
      } else {
        product = await client.products.create({
          name,
          description: `${plan.description} Billed ${interval.label.toLowerCase()}.`,
          tax_category: "saas",
          price: {
            type: "recurring_price",
            currency: "USD",
            price: cents,
            discount: 0,
            purchasing_power_parity: false,
            payment_frequency_count: 1,
            payment_frequency_interval: interval.interval,
            subscription_period_count: 1,
            subscription_period_interval: interval.interval,
            tax_inclusive: false,
            trial_period_days: 0,
          },
          metadata: { app: BRAND.toLowerCase(), plan_tier: plan.tier, billing_interval: interval.id },
        });
        console.error(`+ created  ${name} → ${product.product_id}`);
      }
      envLines.push(`DODO_PRODUCT_${plan.tier}_${interval.id}=${product.product_id}`);
    }
  }

  for (const w of warnings) console.error(`! ${w}`);
  console.error(`\nPaste into .env (${mode} mode):\n`);
  // Env lines go to stdout so `node ... >> .env` works; everything else is on stderr.
  console.log(envLines.join("\n"));
}

main().catch((err) => {
  const status = err && typeof err === "object" && "status" in err ? ` (HTTP ${err.status})` : "";
  console.error(`Failed${status}: ${err instanceof Error ? err.message : String(err)}`);
  if (err && typeof err === "object" && "error" in err) console.error(JSON.stringify(err.error, null, 2));
  process.exit(1);
});
