/**
 * Plumbing shared by the OAuth endpoints and /mcp.
 *
 * AI apps call these from their own servers and, for some, from a browser or
 * a desktop webview, so every endpoint answers CORS preflights and allows any
 * origin. That is safe here: none of them reads a cookie. They authenticate
 * with client credentials, PKCE or a bearer token.
 */
import { NextResponse } from "next/server";

import { PayloadTooLargeError, readBodyWithLimit } from "@/lib/security/body-limit";

/** Token, register and revoke requests are a few hundred bytes. */
export const OAUTH_BODY_LIMIT_BYTES = 64 * 1024;

export function corsHeaders(methods = "POST, OPTIONS"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
    "Access-Control-Expose-Headers": "www-authenticate, mcp-session-id, mcp-protocol-version",
    "Access-Control-Max-Age": "86400",
  };
}

export function preflight(methods = "POST, OPTIONS"): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(methods) });
}

/** JSON with CORS and, for anything carrying a token or secret, no caching. */
export function oauthJson(body: unknown, init: { status?: number; methods?: string; cache?: string; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...corsHeaders(init.methods), "Cache-Control": init.cache ?? "no-store", Pragma: "no-cache", ...init.headers },
  });
}

export function oauthErrorJson(error: string, description: string, status = 400, headers?: Record<string, string>): NextResponse {
  return oauthJson({ error, error_description: description }, { status, headers });
}

/**
 * Reads a token-style request body. The spec says form encoding; some apps
 * send JSON or leave the content type off, so both are accepted.
 */
export async function readOAuthParams(req: Request): Promise<URLSearchParams> {
  let text: string;
  try {
    text = await readBodyWithLimit(req, OAUTH_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) throw new OAuthBodyError("Request body too large.");
    throw new OAuthBodyError("Could not read the request body.");
  }
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json") || text.trimStart().startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OAuthBodyError("Request body is not valid JSON.");
    }
    const params = new URLSearchParams();
    if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string") params.set(key, value);
      }
    }
    return params;
  }
  return new URLSearchParams(text);
}

export class OAuthBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthBodyError";
  }
}

/** Client credentials from HTTP Basic (client_secret_basic) or the body (client_secret_post, or a public client's id). */
export function clientCredentials(req: Request, params: URLSearchParams): { clientId: string | null; clientSecret: string | null } {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon > 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, colon)),
          clientSecret: decodeURIComponent(decoded.slice(colon + 1)),
        };
      }
    } catch {
      return { clientId: null, clientSecret: null };
    }
  }
  return { clientId: params.get("client_id"), clientSecret: params.get("client_secret") };
}
