/**
 * Prints the exact value for every field you must paste into the Supabase,
 * Google Cloud and Meta consoles, derived from NEXT_PUBLIC_APP_URL.
 *
 *   node --env-file=.env scripts/print-setup-urls.mjs
 *
 * Run it again after changing NEXT_PUBLIC_APP_URL (e.g. a new tunnel URL or
 * your production domain) — every URL below changes with it, and Meta matches
 * redirect URIs exactly, so a stale value is the usual cause of
 * "URL blocked: this redirect failed".
 */
const RESET = "\x1b[0m";
const bold = (s) => `\x1b[1m${s}${RESET}`;
const dim = (s) => `\x1b[2m${s}${RESET}`;
const cyan = (s) => `\x1b[36m${s}${RESET}`;
const yellow = (s) => `\x1b[33m${s}${RESET}`;

const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";

if (!app) {
  console.log(yellow("\nNEXT_PUBLIC_APP_URL is not set — fill it in first.\n"));
  process.exit(1);
}
if (app.startsWith("http://localhost")) {
  console.log(yellow("\n⚠  NEXT_PUBLIC_APP_URL is localhost."));
  console.log("   Meta needs a public HTTPS URL. Run `npm run tunnel`, paste the");
  console.log("   https://…trycloudflare.com URL into .env, then re-run this.\n");
}

function row(field, value) {
  console.log(`  ${field}`);
  console.log(`    ${cyan(value)}`);
}

console.log(`\n${bold("═══ Supabase")}  ${dim("supabase.com/dashboard → your project")}`);
console.log(`\n${bold("Authentication → URL Configuration")}`);
row("Site URL", app);
row("Redirect URLs  (add both)", `${app}/**`);
console.log(`    ${cyan("http://localhost:3000/**")}   ${dim("keeps plain local dev working")}`);
console.log(`\n${bold("Authentication → Sign In / Providers → Google")}`);
console.log(`    Enable it, then paste the Client ID + Client Secret from Google Cloud (below).`);
if (supabase) {
  console.log(`    ${dim("Supabase shows a callback URL — it is:")}`);
  console.log(`    ${cyan(`${supabase}/auth/v1/callback`)}`);
} else {
  console.log(`    ${dim("Fill NEXT_PUBLIC_SUPABASE_URL in .env to see your callback URL here.")}`);
}

console.log(`\n${bold("═══ Google Cloud")}  ${dim("console.cloud.google.com → APIs & Services → Credentials")}`);
console.log(`\n${bold("OAuth client ID → Web application")}`);
row("Authorized JavaScript origins", app);
row(
  "Authorized redirect URI",
  supabase ? `${supabase}/auth/v1/callback` : "<your-supabase-url>/auth/v1/callback  ← fill NEXT_PUBLIC_SUPABASE_URL first",
);
console.log(`    ${dim("Note: this points at SUPABASE, not at your app. Supabase brokers the")}`);
console.log(`    ${dim("Google login and then redirects back to your app's /auth/callback.")}`);

console.log(`\n${bold("═══ Meta")}  ${dim("developers.facebook.com → your app")}`);
console.log(`\n${bold("App settings → Basic")}`);
row("App domains", app.replace(/^https?:\/\//, ""));
row("Privacy Policy URL", `${app}/privacy`);
row("Terms of Service URL", `${app}/terms`);
row("User data deletion → Data deletion request URL", `${app}/api/meta/data-deletion`);
row("Deauthorize callback URL", `${app}/api/meta/deauthorize`);

console.log(`\n${bold("Instagram → API setup with Instagram login")}`);
console.log(`  ${bold("3. Set up webhooks")}`);
row("Callback URL", `${app}/api/webhooks/meta`);
row("Verify token", verifyToken || "<META_WEBHOOK_VERIFY_TOKEN not set>");
console.log(`    Subscribe to fields: ${cyan("comments, live_comments, messages, messaging_postbacks")}`);
console.log(`  ${bold("4. Set up Instagram business login")} → Business login settings`);
row("OAuth redirect URI", `${app}/api/meta/instagram/callback`);
row("Deauthorize callback URL", `${app}/api/meta/deauthorize`);
row("Data deletion request URL", `${app}/api/meta/data-deletion`);
console.log(`    ${dim("Copy 'Instagram app ID' and 'Instagram app secret' from this page into")}`);
console.log(`    ${dim("INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET — they differ from the app id above.")}`);

console.log(`\n${bold("Facebook Login for Business → Settings")}`);
row("Valid OAuth Redirect URIs", `${app}/api/meta/facebook/callback`);

console.log(`\n${bold("Webhooks → Page")}  ${dim("(for Facebook Page comments + Messenger)")}`);
row("Callback URL", `${app}/api/webhooks/meta`);
row("Verify token", verifyToken || "<META_WEBHOOK_VERIFY_TOKEN not set>");
console.log(`    Subscribe to fields: ${cyan("feed, messages, messaging_postbacks")}`);

console.log(`\n${bold("═══ Dodo Payments")}  ${dim("app.dodopayments.com → Developer → Webhooks")}`);
row("Endpoint URL", `${app}/api/billing/webhook`);
console.log(`    ${dim("Copy its signing secret (whsec_…) into DODO_WEBHOOK_SECRET.")}`);
console.log(`    Subscribe to: ${cyan("subscription.*, payment.*")}`);

console.log(`\n${dim("Then run:")} ${bold("npm run verify")}\n`);
