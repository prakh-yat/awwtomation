import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { OAUTH_COOKIE, decodeOAuthTransaction, safeEqual } from "@/lib/auth/cookies";
import { exchangeCodeForIdToken, googleRedirectUri, isGoogleConfigured, readIdentity } from "@/lib/auth/google";
import { resolveOrigin } from "@/lib/auth/origin";
import { createSession, syncGoogleUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { ensureDefaultOrganization } from "@/lib/services/organizations";
import { sanitizeNextPath } from "@/lib/utils";
import { readActiveWorkspaceCookie, setActiveOrganizationCookies } from "@/lib/workspace/cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginRedirect(origin: string, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, origin));
}

/**
 * Google's OAuth redirect target: verify `state`, exchange `?code` for an
 * id_token, mirror the person into our DB, start their session, make sure they
 * have a workspace, then send them on to the sanitized `next` target.
 *
 * This URL, `<app origin>/auth/callback`, is what must be registered as an
 * Authorized redirect URI on the Google Cloud OAuth client.
 */
export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request);
  const params = request.nextUrl.searchParams;
  const store = await cookies();

  // Whatever happens below, this attempt is spent.
  const transaction = decodeOAuthTransaction(store.get(OAUTH_COOKIE)?.value);
  store.delete(OAUTH_COOKIE);

  // Google reports consent problems via error params instead of a code.
  const providerError = params.get("error");
  if (providerError) {
    logger.warn("auth.callback.provider_error", {
      error: providerError,
      description: params.get("error_description"),
    });
    return loginRedirect(origin, providerError === "access_denied" ? "access_denied" : "oauth_failed");
  }

  if (!isGoogleConfigured()) return loginRedirect(origin, "not_configured");

  const code = params.get("code");
  if (!code) return loginRedirect(origin, "missing_code");

  // No transaction cookie means a stale tab, a bookmarked callback URL, or a
  // forged request: all of which must not produce a session.
  const state = params.get("state");
  if (!transaction || !state || !safeEqual(state, transaction.state)) {
    logger.warn("auth.callback.state_mismatch", { hasTransaction: Boolean(transaction), hasState: Boolean(state) });
    return loginRedirect(origin, "expired_state");
  }

  let user: User;
  try {
    const idToken = await exchangeCodeForIdToken({
      code,
      redirectUri: googleRedirectUri(origin),
      codeVerifier: transaction.verifier,
    });
    user = await syncGoogleUser(readIdentity(idToken));
  } catch (err) {
    logger.error("auth.callback.exchange_failed", { error: err });
    return loginRedirect(origin, "exchange_failed");
  }

  await createSession(user.id);

  const next = sanitizeNextPath(transaction.next, "/dashboard");

  // Someone arriving through an invite link is joining an existing team: don't
  // saddle them with a personal organization they never asked for.
  const joiningViaInvite = next.startsWith("/invite/");
  if (!joiningViaInvite) {
    try {
      const { organization, workspace, created } = await ensureDefaultOrganization(user);
      if (!(await readActiveWorkspaceCookie())) await setActiveOrganizationCookies(organization.id, workspace.id);
      if (created && next === "/dashboard") {
        // Fresh account: go straight to the welcome questionnaire, which
        // connects the first channel in the middle of it.
        return NextResponse.redirect(new URL("/welcome", origin));
      }
    } catch (err) {
      logger.error("auth.callback.ensure_organization_failed", { userId: user.id, error: err });
      // The user is signed in; /onboarding will offer to create an organization manually.
      return NextResponse.redirect(new URL("/onboarding", origin));
    }
  }

  logger.info("auth.signed_in", { userId: user.id });
  return NextResponse.redirect(new URL(next, origin));
}
