import { type CookieOptions, createServerClient } from "@supabase/ssr";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { devAuthEmail } from "@/lib/auth/dev";
import { logger } from "@/lib/logger";
import { supabasePublicEnv } from "@/lib/supabase/config";
import { PATHNAME_HEADER } from "@/lib/workspace/request";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Forward the incoming headers (including any cookies rotated so far) plus the
 * pathname. Layouts have no other way to learn the URL they're rendering for,
 * and the `(app)` layout needs it to let `/onboarding` through without a workspace.
 */
function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return headers;
}

/**
 * Refreshes the Supabase auth cookie on every matched request and returns the
 * (possibly rotated) response plus the verified user.
 *
 * `auth.getUser()` validates the JWT against Supabase rather than trusting the
 * cookie payload, which is why we use it instead of `getSession()` for gating.
 * The response object must be the one returned from middleware — replacing it
 * without copying cookies would silently drop the refreshed session.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: SupabaseUser | null }> {
  let response = NextResponse.next({ request: { headers: forwardedHeaders(request) } });

  // Local development bypass (NODE_ENV=development only): no Supabase round
  // trip, the page layer resolves the same user via getCurrentUser().
  const devEmail = devAuthEmail();
  if (devEmail) {
    return { response, user: { id: `dev:${devEmail}`, email: devEmail } as SupabaseUser };
  }

  const { url, anonKey } = supabasePublicEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Mutate the request so downstream server code sees the fresh cookies,
        // then rebuild the response so the browser receives them too.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: forwardedHeaders(request) } });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { response, user };
  } catch (err) {
    // Network hiccup talking to Supabase: fail closed (treat as signed out) but
    // keep serving so public pages are unaffected.
    logger.warn("auth.middleware.get_user_failed", { error: err });
    return { response, user: null };
  }
}
