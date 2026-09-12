import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublicEnv } from "@/lib/supabase/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Uses the getAll/setAll cookie bridge required by @supabase/ssr. Server
 * Components cannot write cookies, so `setAll` swallows that error — the
 * middleware (`updateSession`) is what actually refreshes the auth cookie.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only here and the
          // session was already refreshed by middleware, so this is safe to ignore.
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
