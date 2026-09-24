import { NextResponse } from "next/server";

import { clientCredentials, corsHeaders, OAuthBodyError, oauthErrorJson, preflight, readOAuthParams } from "@/lib/oauth/http";
import { authenticateClient, revokeToken } from "@/lib/services/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /oauth/revoke (RFC 7009). Ends the app's session for that person. A
 * well-formed request always gets 200, known token or not, so the endpoint
 * cannot be used to probe for valid tokens.
 */
export async function POST(req: Request) {
  let params: URLSearchParams;
  try {
    params = await readOAuthParams(req);
  } catch (err) {
    return oauthErrorJson("invalid_request", err instanceof OAuthBodyError ? err.message : "Could not read the request.");
  }

  const token = params.get("token");
  if (!token) return oauthErrorJson("invalid_request", "token is required.");

  const { clientId, clientSecret } = clientCredentials(req, params);
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return oauthErrorJson("invalid_client", "Client authentication failed.", 401);

  await revokeToken(token, client.clientId);
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

export function OPTIONS() {
  return preflight();
}
