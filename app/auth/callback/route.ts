import type { User } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { ensureDefaultOrganization } from "@/lib/services/organizations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/utils";
import { readActiveWorkspaceCookie, setActiveOrganizationCookies } from "@/lib/workspace/cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public origin for redirects. Behind a proxy (Vercel, Railway) `request.url`
 * can be the internal address, so prefer the configured app URL, then the
 * forwarded host, then whatever Next saw.
 */
function resolveOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

function loginRedirect(origin: string, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, origin));
}

/**
 * Supabase PKCE callback: exchange `?code` for a session (sets auth cookies),
 * mirror the user into our DB, make sure they have a workspace, then send them
 * on to the sanitized `?next` target.
 */
export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request);
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = sanitizeNextPath(params.get("next"), "/dashboard");

  // Google/Supabase report consent problems via error params instead of a code.
  const providerError = params.get("error") ?? params.get("error_code");
  if (providerError) {
    logger.warn("auth.callback.provider_error", { error: providerError, description: params.get("error_description") });
    return loginRedirect(origin, providerError === "access_denied" ? "access_denied" : "oauth_failed");
  }
  if (!code) return loginRedirect(origin, "missing_code");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logger.warn("auth.callback.exchange_failed", { message: error.message, status: error.status });
    return loginRedirect(origin, "exchange_failed");
  }

  let user: User | null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    logger.error("auth.callback.sync_failed", { error: err });
    return loginRedirect(origin, "sync_failed");
  }
  if (!user) return loginRedirect(origin, "no_user");

  // Someone arriving through an invite link is joining an existing team — don't
  // saddle them with a personal organization they never asked for.
  const joiningViaInvite = next.startsWith("/invite/");
  if (!joiningViaInvite) {
    try {
      const { organization, workspace, created } = await ensureDefaultOrganization(user);
      if (!(await readActiveWorkspaceCookie())) await setActiveOrganizationCookies(organization.id, workspace.id);
      if (created && next === "/dashboard") {
        // Fresh account: go straight to connecting a channel.
        return NextResponse.redirect(new URL("/channels?onboarding=1", origin));
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
