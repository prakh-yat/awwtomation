import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { sanitizeNextPath } from "@/lib/utils";

/**
 * Route prefixes that require a signed-in user. Everything else (marketing,
 * /login, /invite, /l, webhooks) is public — the page itself decides what to do.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/automations",
  "/inbox",
  "/contacts",
  "/broadcasts",
  "/channels",
  "/links",
  "/logs",
  "/settings",
  "/admin",
  "/onboarding",
  "/checkout",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * A redirect is a brand-new response, so the refreshed Supabase cookies set
 * on `response` must be copied across or the session silently rots.
 */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithCookies(url, response);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"), "/dashboard");
    const target = new URL(next, request.nextUrl.origin);
    url.pathname = target.pathname;
    url.search = target.search;
    return redirectWithCookies(url, response);
  }

  return response;
}

export const config = {
  // Skip static assets, Meta/Dodo webhooks (signed, no session), the health probe and
  // cron routes (secret-guarded, must answer even when Supabase env is missing)
  // and tracked-link redirects (public, latency-sensitive). Everything else
  // refreshes the session.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/webhooks|api/billing/webhook|api/health|api/cron|l/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|woff2?|ttf|map)$).*)",
  ],
};
