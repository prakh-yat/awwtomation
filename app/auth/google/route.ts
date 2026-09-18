import { type NextRequest, NextResponse } from "next/server";

import { OAUTH_COOKIE, encodeOAuthTransaction, oauthCookieOptions } from "@/lib/auth/cookies";
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  googleRedirectUri,
  isGoogleConfigured,
} from "@/lib/auth/google";
import { resolveOrigin } from "@/lib/auth/origin";
import { logger } from "@/lib/logger";
import { sanitizeNextPath } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts Google sign-in: mint a `state` and a PKCE verifier, stash both in a
 * short-lived httpOnly cookie, and bounce the browser to Google.
 *
 * The button on /login is a plain link to this route, so sign-in works with
 * JavaScript still loading and there is no client-side auth SDK to configure.
 */
export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request);
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"), "/dashboard");

  if (!isGoogleConfigured()) {
    logger.error("auth.google.not_configured", {});
    return NextResponse.redirect(new URL("/login?error=not_configured", origin));
  }

  const state = createState();
  const { verifier, challenge } = await createPkcePair();

  const authorizeUrl = buildAuthorizeUrl({
    redirectUri: googleRedirectUri(origin),
    state,
    codeChallenge: challenge,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_COOKIE, encodeOAuthTransaction({ state, verifier, next }), oauthCookieOptions());
  return response;
}
