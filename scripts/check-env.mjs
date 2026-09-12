#!/usr/bin/env node
/**
 * Prints which environment variables are set, masked, grouped by purpose —
 * run it on a fresh server before the first deploy, or when something 500s.
 *
 *   node scripts/check-env.mjs            # reads .env (if present) + process env
 *   node scripts/check-env.mjs --no-dotenv
 *   node scripts/check-env.mjs --json     # machine-readable, for deploy scripts
 *
 * Exit code 1 when a REQUIRED variable is missing, so it can gate a deploy.
 * Zero dependencies on purpose: it must work inside the runner image, which
 * ships without node_modules.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const useDotenv = !args.has("--no-dotenv");
const asJson = args.has("--json");

// Minimal .env parser (KEY=value, optional quotes, # comments). Real values in
// the process environment always win, matching dotenv's own precedence.
if (useDotenv) {
  const file = resolve(process.cwd(), process.env.ENV_FILE ?? ".env");
  if (existsSync(file)) {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

/** @type {Array<{ group: string; vars: Array<{ name: string; level: "required" | "recommended" | "optional"; note?: string; check?: (v: string) => string | null }>}>} */
const GROUPS = [
  {
    group: "App",
    vars: [
      { name: "NEXT_PUBLIC_APP_URL", level: "required", check: (v) => (/^https?:\/\//.test(v) ? (v.startsWith("http://") && process.env.NODE_ENV === "production" ? "http:// in production — Meta OAuth needs https" : null) : "must start with http(s)://") },
      { name: "APP_ENCRYPTION_KEY", level: "required", check: (v) => (v.length >= 32 ? null : "must be at least 32 characters (openssl rand -base64 32)") },
      { name: "CRON_SECRET", level: "recommended", note: "protects /api/cron/*", check: (v) => (v.length >= 8 ? null : "must be at least 8 characters") },
      { name: "SUPER_ADMIN_EMAILS", level: "recommended", note: "unlocks /admin" },
      { name: "NODE_ENV", level: "optional" },
    ],
  },
  {
    group: "Database",
    vars: [
      { name: "DATABASE_URL", level: "required", check: (v) => (v.startsWith("postgres") ? null : "must be a postgresql:// URL") },
      { name: "DIRECT_URL", level: "recommended", note: "needed by prisma migrate" },
    ],
  },
  {
    group: "Supabase auth",
    vars: [
      { name: "NEXT_PUBLIC_SUPABASE_URL", level: "required", check: (v) => (v.startsWith("https://") ? null : "must be https://") },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", level: "required" },
    ],
  },
  {
    group: "Meta — Instagram Login",
    vars: [
      { name: "INSTAGRAM_APP_ID", level: "optional" },
      { name: "INSTAGRAM_APP_SECRET", level: "optional" },
    ],
  },
  {
    group: "Meta — Facebook / Messenger",
    vars: [
      { name: "META_APP_ID", level: "optional" },
      { name: "META_APP_SECRET", level: "optional", note: "also signs webhooks" },
      { name: "META_WEBHOOK_VERIFY_TOKEN", level: "recommended" },
      { name: "META_GRAPH_API_VERSION", level: "optional", note: "default v25.0" },
    ],
  },
  {
    group: "Dodo Payments (billing)",
    vars: [
      { name: "DODO_MODE", level: "optional", note: "test | live", check: (v) => (["test", "live"].includes(v) ? null : "must be test or live") },
      { name: "DODO_SECRET_KEY", level: "optional" },
      { name: "DODO_WEBHOOK_SECRET", level: "optional" },
      { name: "DODO_PRODUCT_STARTER_MONTHLY", level: "optional" },
      { name: "DODO_PRODUCT_STARTER_ANNUAL", level: "optional" },
      { name: "DODO_PRODUCT_PRO_MONTHLY", level: "optional" },
      { name: "DODO_PRODUCT_PRO_ANNUAL", level: "optional" },
      { name: "DODO_PRODUCT_AGENCY_MONTHLY", level: "optional" },
      { name: "DODO_PRODUCT_AGENCY_ANNUAL", level: "optional" },
      { name: "DODO_ALLOW_TEST_MODE_IN_PRODUCTION", level: "optional" },
    ],
  },
  {
    group: "Email (Resend)",
    vars: [
      { name: "RESEND_API_KEY", level: "optional" },
      { name: "EMAIL_FROM", level: "optional" },
    ],
  },
  {
    group: "Worker tuning",
    vars: [
      { name: "WORKER_POLL_INTERVAL_MS", level: "optional", note: "default 2000" },
      { name: "WORKER_BATCH_SIZE", level: "optional", note: "default 10" },
      { name: "COMMENT_POLL_INTERVAL_MS", level: "optional", note: "default 300000" },
    ],
  },
  {
    group: "Development only",
    vars: [{ name: "DEV_AUTH_EMAIL", level: "optional", note: "ignored unless NODE_ENV=development" }],
  },
];

/** Show enough to recognise a value without leaking it. URLs keep host, lose credentials. */
function mask(name, value) {
  if (/_URL$/.test(name)) {
    // String-level so the output stays readable (URL.toString() would percent-encode the mask).
    return value.replace(/\/\/([^:/@]*)(:[^@]*)?@/, (_m, user, pass) => `//${user.slice(0, 4)}…${pass ? ":••••" : ""}@`);
  }
  if (name === "NODE_ENV" || name === "DODO_MODE" || name === "META_GRAPH_API_VERSION" || name === "SUPER_ADMIN_EMAILS" || name === "EMAIL_FROM" || name === "DEV_AUTH_EMAIL" || /_MS$|_SIZE$/.test(name)) {
    return value;
  }
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.min(value.length - 3, 12))} (${value.length} chars)`;
}

const rows = [];
let missingRequired = 0;
for (const { group, vars } of GROUPS) {
  for (const v of vars) {
    const value = process.env[v.name];
    const set = value !== undefined && value !== "";
    const problem = set && v.check ? v.check(value) : null;
    if (!set && v.level === "required") missingRequired++;
    rows.push({ group, name: v.name, level: v.level, set, value: set ? mask(v.name, value) : "", problem, note: v.note ?? "" });
  }
}

/** Integration summary mirrors what /api/health and the boot log report. */
const summary = {
  instagram: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
  facebook: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  billing: Boolean(process.env.DODO_SECRET_KEY && process.env.DODO_WEBHOOK_SECRET),
  email: Boolean(process.env.RESEND_API_KEY),
  cron: Boolean(process.env.CRON_SECRET),
};

if (asJson) {
  console.log(JSON.stringify({ ok: missingRequired === 0, missingRequired, integrations: summary, rows }, null, 2));
  process.exit(missingRequired === 0 ? 0 : 1);
}

const width = Math.max(...rows.map((r) => r.name.length));
let currentGroup = "";
for (const r of rows) {
  if (r.group !== currentGroup) {
    currentGroup = r.group;
    console.log(`\n${currentGroup}`);
  }
  const status = r.set ? (r.problem ? "WARN" : "ok  ") : r.level === "required" ? "MISSING" : r.level === "recommended" ? "unset  " : "-      ";
  const detail = r.set ? r.value : r.note;
  const flag = r.level === "required" ? "*" : " ";
  const line = `  ${status.padEnd(7)} ${flag} ${r.name.padEnd(width)}  ${detail}`;
  console.log(r.problem ? `${line}\n           ${" ".repeat(width + 4)}^ ${r.problem}` : line);
}
console.log(`\nIntegrations: ${Object.entries(summary).map(([k, v]) => `${k}=${v ? "on" : "off"}`).join("  ")}`);
console.log(`* required. ${missingRequired === 0 ? "All required variables are set." : `${missingRequired} required variable(s) missing — see .env.example.`}\n`);
process.exit(missingRequired === 0 ? 0 : 1);
