/**
 * Dependency-free constants shared between the Edge middleware and server
 * components. Keep this file import-free: `lib/supabase/middleware.ts` runs
 * on the Edge runtime and must not transitively pull in Prisma.
 */

/** Request header set by `middleware.ts` carrying the pathname being rendered. */
export const PATHNAME_HEADER = "x-pathname";

/** The one `(app)` route that must render for users with zero workspaces. */
export const ONBOARDING_PATH = "/onboarding";
