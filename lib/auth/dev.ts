/**
 * Development-only sign-in bypass.
 *
 * Setting DEV_AUTH_EMAIL in `.env` makes every request act as that user
 * without Supabase — so the whole app (including the worker and the seed
 * data) runs locally with just the embedded Postgres from `npm run db:local`.
 *
 * It is hard-gated on NODE_ENV === "development": `next build` / `next start`
 * compile to "production", so the variable is inert on any deployed host even
 * if someone copies it into production env by mistake. Edge-safe (no Node APIs).
 */
export function devAuthEmail(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const value = process.env.DEV_AUTH_EMAIL?.trim().toLowerCase();
  return value && value.includes("@") ? value : null;
}
