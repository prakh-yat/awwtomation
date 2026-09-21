/**
 * Next.js instrumentation hook: `register()` runs once per server boot on
 * the Node runtime (never on Edge, never during `next build`).
 *
 * Two jobs: fail fast in production when a REQUIRED variable is missing, so a
 * misconfigured deploy dies at boot instead of 500-ing on its first request;
 * and log one structured line saying which OPTIONAL integrations are off, so
 * an operator can tell "billing not configured" from "billing broken".
 * Optional integrations never throw: a fresh install without Meta or Dodo
 * credentials must still boot so the owner can sign in and finish setup.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Imported lazily so the Edge bundle (middleware) never pulls in zod/env.
  const { getEnv, isMetaConfigured } = await import("@/lib/env");
  const { logger } = await import("@/lib/logger");

  const production = process.env.NODE_ENV === "production";

  try {
    getEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("app.boot.invalid_env", { message });
    if (production) throw err;
    // In development the page layer surfaces the same error with more context.
    return;
  }

  const meta = isMetaConfigured();
  const integrations = {
    instagram: meta.instagram,
    facebook: meta.facebook,
    billing: Boolean(process.env.DODO_SECRET_KEY && process.env.DODO_WEBHOOK_SECRET),
    email: Boolean(process.env.RESEND_API_KEY),
    cron: Boolean(process.env.CRON_SECRET),
    // Named without "Token": the logger redacts keys that look like secrets, and this is a boolean.
    webhookVerify: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
  };
  const missingOptional = Object.entries(integrations)
    .filter(([, configured]) => !configured)
    .map(([name]) => name);

  logger.info("app.boot", {
    nodeEnv: process.env.NODE_ENV,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    integrations,
    missingOptional,
  });

  if (production && process.env.DODO_MODE !== "live" && integrations.billing) {
    logger.warn("app.boot.billing_test_mode", {
      hint:
        process.env.DODO_MODE === "test"
          ? "DODO_MODE=test was set explicitly. Test checkout is enabled and no real payment will be collected."
          : "DODO_MODE is unset, so checkout will fail closed. Set DODO_MODE=test intentionally or configure live billing.",
    });
  }
}
