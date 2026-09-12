import DodoPayments, { APIConnectionError, APIError } from "dodopayments";

import { type DodoMode, getDodoMode, getSecretKey } from "@/lib/billing/dodo/config";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/workspace/api";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

let cached: { key: string; mode: DodoMode; client: DodoPayments } | null = null;

/**
 * Memoized SDK client. Keyed on secret + mode so rotating the key or flipping
 * DODO_MODE at runtime (e.g. in a long-lived worker) picks up the change.
 */
export function getDodoClient(): DodoPayments {
  const key = getSecretKey();
  if (!key) throw new ApiError(503, "Billing isn't configured yet", "BILLING_NOT_CONFIGURED");
  const mode = getDodoMode();
  if (cached && cached.key === key && cached.mode === mode) return cached.client;

  const client = new DodoPayments({
    bearerToken: key,
    environment: mode === "live" ? "live_mode" : "test_mode",
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    // The SDK's own logger would print request details; ours only sees what we choose to log.
    logLevel: "off",
  });
  cached = { key, mode, client };
  return client;
}

/**
 * Converts any SDK failure into an `ApiError` with a message safe to show a
 * customer. Provider status codes and bodies are logged (never the key) so an
 * operator can still diagnose 4xx responses from the dashboard logs.
 */
export function toBillingError(err: unknown, context: string): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof APIConnectionError) {
    logger.error("billing.provider_unreachable", { context, error: err });
    return new ApiError(502, "Couldn't reach the billing provider. Please try again.", "BILLING_UNAVAILABLE");
  }

  if (err instanceof APIError) {
    const status = err.status ?? 0;
    logger.error("billing.provider_error", { context, status, body: err.error ?? null, message: err.message });
    switch (status) {
      case 400:
      case 422:
        return new ApiError(400, "The billing provider rejected the request", "BILLING_BAD_REQUEST");
      case 401:
      case 403:
        return new ApiError(503, "Billing is misconfigured — please contact support", "BILLING_MISCONFIGURED");
      case 404:
        return new ApiError(404, "Billing record not found", "BILLING_NOT_FOUND");
      case 409:
        return new ApiError(409, "That change conflicts with the current subscription state", "BILLING_CONFLICT");
      case 429:
        return new ApiError(429, "Too many billing requests — try again in a moment", "BILLING_RATE_LIMITED");
      default:
        return new ApiError(502, "The billing provider is having trouble. Please try again.", "BILLING_UNAVAILABLE");
    }
  }

  logger.error("billing.unexpected_error", { context, error: err instanceof Error ? err : String(err) });
  return new ApiError(500, "Something went wrong with billing", "BILLING_ERROR");
}
