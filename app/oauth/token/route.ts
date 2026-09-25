import { logger } from "@/lib/logger";
import { clientCredentials, OAuthBodyError, oauthErrorJson, oauthJson, preflight, readOAuthParams } from "@/lib/oauth/http";
import { checkRateLimit, clientIp, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { hasLiveGrant } from "@/lib/services/mcp-access";
import { authenticateClient, exchangeAuthorizationCode, isOwnResource, OAuthError, refreshAccessToken } from "@/lib/services/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_LIMIT_PER_MINUTE = 60;

/**
 * POST /oauth/token (RFC 6749 section 3.2).
 * - authorization_code: a PKCE code from /oauth/authorize becomes an access and refresh token.
 * - refresh_token: a refresh token is rotated into a fresh pair.
 */
export async function POST(req: Request) {
  const limit = await checkRateLimit("oauth_token", clientIp(req), TOKEN_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (!limit.allowed) {
    return oauthErrorJson("slow_down", "Too many token requests. Try again in a minute.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  let params: URLSearchParams;
  try {
    params = await readOAuthParams(req);
  } catch (err) {
    return oauthErrorJson("invalid_request", err instanceof OAuthBodyError ? err.message : "Could not read the request.");
  }

  const grantType = params.get("grant_type");
  if (!grantType) return oauthErrorJson("invalid_request", "grant_type is required.");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return oauthErrorJson("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
  }

  const { clientId, clientSecret } = clientCredentials(req, params);
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) {
    const usedBasic = req.headers.get("authorization")?.toLowerCase().startsWith("basic ");
    return oauthErrorJson("invalid_client", "Client authentication failed.", 401, usedBasic ? { "WWW-Authenticate": 'Basic realm="oauth"' } : undefined);
  }

  if (!isOwnResource(params.get("resource"))) {
    return oauthErrorJson("invalid_target", "Tokens are only issued for this server's /mcp endpoint.");
  }

  try {
    if (grantType === "authorization_code") {
      const code = params.get("code");
      const redirectUri = params.get("redirect_uri");
      const codeVerifier = params.get("code_verifier");
      if (!code) return oauthErrorJson("invalid_request", "code is required.");
      if (!redirectUri) return oauthErrorJson("invalid_request", "redirect_uri is required.");
      if (!codeVerifier) return oauthErrorJson("invalid_request", "code_verifier is required.");
      return oauthJson(await exchangeAuthorizationCode({ client, code, redirectUri, codeVerifier }));
    }

    const refreshToken = params.get("refresh_token");
    if (!refreshToken) return oauthErrorJson("invalid_request", "refresh_token is required.");
    return oauthJson(await refreshAccessToken({ client, refreshToken, hasLiveAccess: hasLiveGrant }));
  } catch (err) {
    if (err instanceof OAuthError) return oauthErrorJson(err.code, err.description, err.status);
    logger.error("oauth.token_failed", { grantType, clientId: client.clientId, error: err });
    return oauthErrorJson("server_error", "Something went wrong. Try again.", 500);
  }
}

export function OPTIONS() {
  return preflight();
}
