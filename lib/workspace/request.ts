/**
 * Dependency-free constants shared between the Edge middleware and server
 * components. Keep this file import-free: `lib/auth/middleware.ts` runs on the
 * Edge runtime and must not transitively pull in Prisma.
 */

/** Request header set by `middleware.ts` carrying the pathname being rendered. */
export const PATHNAME_HEADER = "x-pathname";

/** The one `(app)` route that must render for users with zero workspaces. */
export const ONBOARDING_PATH = "/onboarding";

/** The welcome questionnaire, which takes the whole window and has no dock. */
export const WELCOME_PATH = "/welcome";

/** Routes under `(app)` that render on their own, without the app shell. */
export function isBareShellPath(pathname: string | null | undefined): boolean {
  return pathname === ONBOARDING_PATH || pathname === WELCOME_PATH;
}

/**
 * The automation builder: `/automations/<id>` exactly, not its report. It takes
 * the whole viewport.
 */
export function isBuilderPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname && /^\/automations\/(?!templates$|new$)[^/]+\/?$/.test(pathname));
}

/** Pages that draw edge to edge with no page padding: the builder and the three-pane inbox. */
export function isFullBleedPath(pathname: string | null | undefined): boolean {
  return isBuilderPath(pathname) || pathname === "/inbox" || Boolean(pathname?.startsWith("/inbox/"));
}
