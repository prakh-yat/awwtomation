import type { NextRequest } from "next/server";

/**
 * The app's public origin, used for redirects and for the OAuth `redirect_uri`.
 *
 * Behind a proxy (Render, Railway, Vercel, Cloudflare) `request.url` can be the
 * internal address, so prefer the configured app URL, then the forwarded host,
 * then whatever Next saw. Both the authorize request and the token exchange
 * call this, so they always produce an identical `redirect_uri`.
 */
export function resolveOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
