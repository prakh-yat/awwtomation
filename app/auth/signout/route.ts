import { type NextRequest, NextResponse } from "next/server";

import { signOut } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { sanitizeNextPath } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest): Promise<NextResponse> {
  try {
    await signOut();
  } catch (err) {
    // Clearing cookies is local and cannot really fail, but a surprise here
    // must still land the visitor on /login rather than an error page.
    logger.warn("auth.signout_error", { error: err });
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  // Optional `?next=` lets flows like "wrong Google account on an invite" come
  // straight back after re-authenticating. Sanitized to block open redirects.
  const next = request.nextUrl.searchParams.get("next");
  const login = next ? `/login?next=${encodeURIComponent(sanitizeNextPath(next))}` : "/login";
  return NextResponse.redirect(new URL(login, base), { status: 303 });
}

/** GET supports plain `<a href="/auth/signout">`; POST is for forms/fetch. */
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
