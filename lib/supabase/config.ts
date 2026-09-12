/**
 * Public Supabase credentials shared by the server, browser and middleware
 * clients. Read straight from `process.env` (not `getEnv()`) because the
 * NEXT_PUBLIC_* values are inlined at build time and must also work in the
 * Edge runtime and in the browser, where the full server schema is unavailable.
 */
export function supabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example)");
  }
  return { url, anonKey };
}
