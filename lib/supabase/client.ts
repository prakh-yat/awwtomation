import { createBrowserClient } from "@supabase/ssr";

import { supabasePublicEnv } from "@/lib/supabase/config";

/**
 * Supabase client for Client Components ("use client").
 * `createBrowserClient` is a singleton under the hood, so calling this in
 * event handlers is cheap and always returns the same instance.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = supabasePublicEnv();
  return createBrowserClient(url, anonKey);
}

export type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;
