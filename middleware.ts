import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/auth/middleware";
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
  "/onboarding",
  "/checkout",
  "/organizations",
  "/usage",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * A redirect is a brand-new response, so a session cookie refreshed on
 * `response` must be copied across or the sliding expiry silently stops working.
 */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!userId && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithCookies(url, response);
  }

  if (userId && pathname === "/login") {
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
  // cron routes (secret-guarded, must answer even when auth env is missing)
  // and tracked-link redirects (public, latency-sensitive). Everything else
  // refreshes the session.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/webhooks|api/billing/webhook|api/health|api/cron|l/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|woff2?|ttf|map)$).*)",
  ],
};
