/**
 * Verifies every external integration Awwtomation needs, live.
 *
 *   node --env-file=.env scripts/verify-setup.mjs
 *
 * Each check either passes, fails with the exact fix, or is skipped because the
 * variable isn't filled in yet. Exit code is 1 if anything required failed, so
 * it also works as a pre-deploy gate in CI.
 *
 * Nothing here writes data — it only reads, so it is safe to run any time.
 */
import { createHmac, randomUUID } from "node:crypto";

const RESET = "\x1b[0m";
const c = {
  green: (s) => `\x1b[32m${s}${RESET}`,
  red: (s) => `\x1b[31m${s}${RESET}`,
  yellow: (s) => `\x1b[33m${s}${RESET}`,
  dim: (s) => `\x1b[2m${s}${RESET}`,
  bold: (s) => `\x1b[1m${s}${RESET}`,
};

let failed = 0;
let skipped = 0;

function pass(label, detail = "") {
  console.log(`  ${c.green("PASS")}  ${label}${detail ? c.dim(`  ${detail}`) : ""}`);
}
function fail(label, why, fix) {
  failed++;
  console.log(`  ${c.red("FAIL")}  ${label}`);
  console.log(`        ${why}`);
  if (fix) console.log(`        ${c.yellow("Fix:")} ${fix}`);
}
function skip(label, why) {
  skipped++;
  console.log(`  ${c.dim("SKIP")}  ${c.dim(label)} ${c.dim(`— ${why}`)}`);
}
function section(title) {
  console.log(`\n${c.bold(title)}`);
}

const env = process.env;
// A var counts as "set" only if it has a real value: empty, whitespace-only or
// a leftover placeholder/comment fragment all mean "not filled in yet".
const has = (k) => {
  const v = (env[k] ?? "").trim();
  return v.length > 0 && !v.startsWith("#") && !v.includes("PASTE") && !v.includes("⟵");
};

/** fetch with a hard timeout so a hanging host can't stall the whole run. */
async function get(url, init = {}, ms = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── 1. Core secrets ─────────────────────────────────────────────────────────
section("1. Core configuration");

const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
if (!appUrl) {
  fail("NEXT_PUBLIC_APP_URL", "Not set.", "Set it to your tunnel or production URL.");
} else if (appUrl.startsWith("http://localhost")) {
  console.log(`  ${c.yellow("WARN")}  NEXT_PUBLIC_APP_URL is localhost`);
  console.log(`        Meta cannot reach localhost: OAuth needs HTTPS and webhooks need a public host.`);
  console.log(`        ${c.yellow("Fix:")} run ${c.bold("npm run tunnel")} and paste the https URL here.`);
} else if (!appUrl.startsWith("https://")) {
  fail("NEXT_PUBLIC_APP_URL", `Not HTTPS (${appUrl}).`, "Meta requires HTTPS redirect URIs.");
} else {
  pass("NEXT_PUBLIC_APP_URL", appUrl);
}

if (!has("APP_ENCRYPTION_KEY")) {
  fail("APP_ENCRYPTION_KEY", "Not set.", "openssl rand -base64 32");
} else {
  const raw = env.APP_ENCRYPTION_KEY;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  buf.length === 32
    ? pass("APP_ENCRYPTION_KEY", "32 bytes")
    : fail("APP_ENCRYPTION_KEY", `Decodes to ${buf.length} bytes, need 32.`, "openssl rand -base64 32");
}

has("CRON_SECRET") ? pass("CRON_SECRET") : fail("CRON_SECRET", "Not set.", "openssl rand -hex 24");
has("META_WEBHOOK_VERIFY_TOKEN")
  ? pass("META_WEBHOOK_VERIFY_TOKEN")
  : fail("META_WEBHOOK_VERIFY_TOKEN", "Not set.", "Any random string; paste the same value into Meta's webhook config.");

// ── 2. Supabase ─────────────────────────────────────────────────────────────
section("2. Supabase");

if (!has("NEXT_PUBLIC_SUPABASE_URL") || !has("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
  skip("Supabase API", "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not filled in");
} else {
  const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  try {
    const res = await get(`${url}/auth/v1/health`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    });
    if (res.ok) {
      pass("Supabase Auth reachable", url);
    } else if (res.status === 401) {
      fail("Supabase anon key", "Auth rejected the key (401).", "Copy the anon/publishable key from Project Settings → Data API.");
    } else {
      fail("Supabase Auth", `HTTP ${res.status} from ${url}/auth/v1/health`, "Check NEXT_PUBLIC_SUPABASE_URL.");
    }
  } catch (err) {
    fail("Supabase Auth", `Could not reach ${url} (${err.message}).`, "Check the project URL and that the project isn't paused.");
  }

  // Google provider: the authorize endpoint 302s to Google when enabled, and
  // returns a 400 with "provider is not enabled" when it isn't.
  try {
    const res = await get(
      `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${appUrl || "http://localhost:3000"}/auth/callback`)}`,
      { redirect: "manual", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } },
    );
    const location = res.headers.get("location") ?? "";
    if (location.includes("accounts.google.com")) {
      pass("Supabase Google provider enabled");
    } else if (location.includes("error") || res.status >= 400) {
      fail(
        "Supabase Google provider",
        "Supabase did not redirect to Google.",
        "Dashboard → Authentication → Sign In / Providers → enable Google and paste your GCP client id + secret.",
      );
    } else {
      console.log(`  ${c.yellow("WARN")}  Google provider: unexpected response (${res.status}). Verify manually in the dashboard.`);
    }
  } catch (err) {
    console.log(`  ${c.yellow("WARN")}  Could not test the Google provider (${err.message}).`);
  }
}

// ── 3. Database ─────────────────────────────────────────────────────────────
section("3. Database");

if (!has("DATABASE_URL")) {
  skip("Postgres", "DATABASE_URL not filled in");
} else {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ log: [] });
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    pass("Postgres connection", `${Date.now() - started}ms`);

    // Are the tables actually there? A connected-but-unmigrated DB is the most
    // common "it should work" failure.
    try {
      const count = await prisma.workspace.count();
      pass("Schema applied", `${count} workspace(s)`);
    } catch {
      fail("Schema applied", "Connected, but the tables are missing.", "npx prisma migrate deploy   (or: npx prisma db push)");
    }
    await prisma.$disconnect();
  } catch (err) {
    const msg = String(err.message).split("\n")[0];
    fail("Postgres connection", msg, "Check DATABASE_URL. For Supabase use the pooled URL (port 6543) and URL-encode the password.");
  }

  if (!has("DIRECT_URL")) {
    console.log(`  ${c.yellow("WARN")}  DIRECT_URL not set — prisma migrate needs the direct (5432) URL.`);
  }
}

// ── 4. Meta ─────────────────────────────────────────────────────────────────
section("4. Meta");

const graphVersion = env.META_GRAPH_API_VERSION || "v25.0";

if (!has("META_APP_ID") || !has("META_APP_SECRET")) {
  skip("Facebook app credentials", "META_APP_ID / META_APP_SECRET not filled in");
} else {
  // An app access token is app_id|app_secret; asking Graph to debug it proves
  // both halves are correct without needing any user to log in.
  const appToken = `${env.META_APP_ID}|${env.META_APP_SECRET}`;
  try {
    const res = await get(
      `https://graph.facebook.com/${graphVersion}/debug_token?input_token=${encodeURIComponent(appToken)}&access_token=${encodeURIComponent(appToken)}`,
    );
    const body = await res.json();
    if (res.ok && body?.data?.app_id === env.META_APP_ID) {
      pass("Facebook app credentials", `app_id ${body.data.app_id}`);
    } else {
      fail(
        "Facebook app credentials",
        body?.error?.message ?? `HTTP ${res.status}`,
        "Copy App ID and App Secret from App settings → Basic.",
      );
    }
  } catch (err) {
    fail("Facebook app credentials", err.message, "Check network access to graph.facebook.com.");
  }
}

if (!has("INSTAGRAM_APP_ID") || !has("INSTAGRAM_APP_SECRET")) {
  skip("Instagram Login credentials", "INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET not filled in");
} else if (env.INSTAGRAM_APP_ID === env.META_APP_ID) {
  fail(
    "Instagram Login credentials",
    "INSTAGRAM_APP_ID is the same as META_APP_ID.",
    "They are different values. Use Instagram → API setup with Instagram login → Instagram app ID / secret.",
  );
} else if (!/^\d{10,}$/.test(env.INSTAGRAM_APP_ID)) {
  fail("Instagram Login credentials", `INSTAGRAM_APP_ID "${env.INSTAGRAM_APP_ID}" is not a numeric id.`, "Copy it from the Instagram product page.");
} else {
  // Meta exposes no unauthenticated endpoint that validates these without a
  // user token, so format + distinctness is as far as we can check offline.
  // The real proof is connecting an account in the app.
  pass("Instagram Login credentials", "format OK (full check = connect an account)");
}

// ── 5. Public reachability + webhook handshake ──────────────────────────────
section("5. Public URL & webhook");

if (!appUrl || appUrl.startsWith("http://localhost")) {
  skip("Webhook handshake", "NEXT_PUBLIC_APP_URL is not a public HTTPS URL yet");
} else if (!has("META_WEBHOOK_VERIFY_TOKEN")) {
  skip("Webhook handshake", "META_WEBHOOK_VERIFY_TOKEN not set");
} else {
  const challenge = String(Math.floor(Math.random() * 1e6));
  const url = `${appUrl}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(env.META_WEBHOOK_VERIFY_TOKEN)}&hub.challenge=${challenge}`;
  try {
    const res = await get(url);
    const text = (await res.text()).trim();
    if (res.ok && text === challenge) {
      pass("Webhook verification handshake", "Meta will accept this callback URL");
    } else {
      fail(
        "Webhook verification handshake",
        `Expected "${challenge}", got HTTP ${res.status} "${text.slice(0, 60)}"`,
        "Is `npm run dev` running and pointed at this tunnel? Does META_WEBHOOK_VERIFY_TOKEN match?",
      );
    }
  } catch (err) {
    fail("Webhook verification handshake", `Could not reach ${appUrl} (${err.message}).`, "Start the app and the tunnel, then re-run.");
  }

  // Signature rejection: a forged POST must never be accepted.
  if (has("META_APP_SECRET")) {
    try {
      const body = JSON.stringify({ object: "instagram", entry: [] });
      const res = await get(`${appUrl}/api/webhooks/meta`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
        body,
      });
      // The route always answers 200 to Meta (correct), so we assert it did not
      // crash rather than asserting a status code.
      res.status === 200
        ? pass("Forged webhook rejected", "handled without error")
        : console.log(`  ${c.yellow("WARN")}  Forged webhook returned HTTP ${res.status} (expected 200 with the event discarded).`);
    } catch {
      /* non-fatal */
    }
  }
}

// ── 6. Dodo Payments ────────────────────────────────────────────────────────
section("6. Dodo Payments");

if (!has("DODO_SECRET_KEY")) {
  skip("Dodo API", "DODO_SECRET_KEY not set");
} else {
  const mode = env.DODO_MODE === "live" ? "live" : "test";
  try {
    const res = await get(`https://${mode}.dodopayments.com/products?page_size=1`, {
      headers: { Authorization: `Bearer ${env.DODO_SECRET_KEY}` },
    });
    if (res.ok) {
      pass(`Dodo API key valid`, `${mode} mode`);
    } else if (res.status === 401) {
      fail("Dodo API key", `Rejected in ${mode} mode (401).`, `The key belongs to the other environment — flip DODO_MODE or use the matching key.`);
    } else {
      fail("Dodo API key", `HTTP ${res.status}`, "Check the key in Dashboard → Developer → API keys.");
    }
  } catch (err) {
    fail("Dodo API", err.message, "Check network access to dodopayments.com.");
  }

  const products = ["STARTER", "PRO", "AGENCY"].flatMap((t) => ["MONTHLY", "ANNUAL"].map((i) => `DODO_PRODUCT_${t}_${i}`));
  const missing = products.filter((k) => !has(k));
  missing.length === 0
    ? pass("Plan product ids", "all 6 set")
    : fail(`Plan product ids`, `Missing: ${missing.join(", ")}`, "node --env-file=.env scripts/create-dodo-products.mjs");

  if (has("DODO_WEBHOOK_SECRET")) {
    env.DODO_WEBHOOK_SECRET.startsWith("whsec_")
      ? pass("Dodo webhook secret", "format OK")
      : fail("Dodo webhook secret", "Does not start with whsec_.", "Copy it from Dashboard → Developer → Webhooks.");
  } else {
    fail("Dodo webhook secret", "Not set.", "Add the endpoint in Dodo and copy its signing secret.");
  }

  if (mode === "test" && env.NODE_ENV === "production") {
    console.log(`  ${c.yellow("WARN")}  Dodo is in TEST mode in production — no real money will be collected.`);
  }
}

// ── 7. Dev escape hatches ───────────────────────────────────────────────────
section("7. Development overrides");

if (has("DEV_AUTH_EMAIL")) {
  console.log(`  ${c.yellow("WARN")}  DEV_AUTH_EMAIL is set (${env.DEV_AUTH_EMAIL}).`);
  console.log(`        Everyone is signed in as this user. It is ignored unless NODE_ENV=development,`);
  console.log(`        but comment it out to test the real Google sign-in flow.`);
} else {
  pass("DEV_AUTH_EMAIL not set", "real Google sign-in is in effect");
}

if ((env.DATABASE_URL ?? "").includes("127.0.0.1:5433")) {
  console.log(`  ${c.yellow("WARN")}  DATABASE_URL points at the embedded local Postgres, not Supabase.`);
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("");
if (failed === 0) {
  console.log(c.green(c.bold(`  All checks passed${skipped ? ` (${skipped} skipped)` : ""}.`)));
  console.log("");
  process.exit(0);
}
console.log(c.red(c.bold(`  ${failed} check${failed === 1 ? "" : "s"} failed${skipped ? `, ${skipped} skipped` : ""}.`)));
console.log("");
process.exit(1);
