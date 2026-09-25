import { logger } from "@/lib/logger";
import { OAuthBodyError, oauthErrorJson, oauthJson, OAUTH_BODY_LIMIT_BYTES, preflight } from "@/lib/oauth/http";
import { PayloadTooLargeError, readBodyWithLimit } from "@/lib/security/body-limit";
import { checkRateLimit, clientIp, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { clientRegistrationSchema, OAuthError, registerClient } from "@/lib/services/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Registration is unauthenticated, so it is capped per address to keep the client table from being flooded. */
const REGISTER_LIMIT_PER_MINUTE = 10;

/**
 * POST /oauth/register: RFC 7591 dynamic client registration. An AI app posts
 * its name and redirect URIs and gets a client id (and a secret, unless it
 * registers as a public PKCE client). This is what lets people connect by
 * pasting the MCP URL alone.
 */
export async function POST(req: Request) {
  const limit = await checkRateLimit("oauth_register", clientIp(req), REGISTER_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (!limit.allowed) {
    return oauthErrorJson("too_many_requests", "Too many registrations. Try again in a minute.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  let body: unknown;
  try {
    const text = await readBodyWithLimit(req, OAUTH_BODY_LIMIT_BYTES);
    body = JSON.parse(text);
  } catch (err) {
    const message = err instanceof PayloadTooLargeError || err instanceof OAuthBodyError ? err.message : "Request body must be JSON.";
    return oauthErrorJson("invalid_client_metadata", message);
  }

  const parsed = clientRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    const onRedirects = parsed.error.issues.some((i) => i.path[0] === "redirect_uris");
    return oauthErrorJson(onRedirects ? "invalid_redirect_uri" : "invalid_client_metadata", detail);
  }

  try {
    return oauthJson(await registerClient(parsed.data), { status: 201 });
  } catch (err) {
    if (err instanceof OAuthError) return oauthErrorJson(err.code, err.description, err.status);
    logger.error("oauth.register_failed", { error: err });
    return oauthErrorJson("server_error", "Registration failed.", 500);
  }
}

export function OPTIONS() {
  return preflight();
}
