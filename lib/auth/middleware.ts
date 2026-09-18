import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { devAuthEmail } from "@/lib/auth/dev";
import { shouldRefresh, signSession, verifySession } from "@/lib/auth/token";
import { PATHNAME_HEADER } from "@/lib/workspace/request";

/**
 * Forward the incoming headers plus the pathname. Layouts have no other way to
 * learn the URL they're rendering for, and the `(app)` layout needs it to let
 * `/onboarding` through without a workspace.
 */
function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return headers;
}

/**
 * Verifies the session cookie on every matched request and slides its expiry
 * for people who keep using the app.
 *
 * This is pure signature checking, no database, no network, so it stays cheap
 * enough to run on every page view in the Edge runtime. The page layer
 * (`getCurrentUser`) is what actually loads the user row.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null }> {
  const response = NextResponse.next({ request: { headers: forwardedHeaders(request) } });

  // Local development bypass (NODE_ENV=development only): see lib/auth/dev.ts.
  const devEmail = devAuthEmail();
  if (devEmail) return { response, userId: `dev:${devEmail}` };

  const payload = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!payload) return { response, userId: null };

  if (shouldRefresh(payload)) {
    response.cookies.set(SESSION_COOKIE, await signSession(payload.uid), sessionCookieOptions());
  }

  return { response, userId: payload.uid };
}
