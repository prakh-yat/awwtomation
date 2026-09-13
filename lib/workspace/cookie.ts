import { cookies } from "next/headers";

/** Cookie holding the id of the organization the user is currently working in. */
export const ACTIVE_ORGANIZATION_COOKIE = "or_org";

/** Cookie holding the id of the workspace (inside that organization) the user is currently working in. */
export const ACTIVE_WORKSPACE_COOKIE = "or_workspace";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Shared cookie attributes so the switch routes, invite acceptance and
 * onboarding all set an identical cookie. httpOnly because only the server
 * reads it; `lax` so it survives the OAuth redirect back from Google.
 */
export function activeWorkspaceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
  };
}

/** Server Actions / Route Handlers only — Server Components cannot write cookies. */
export async function setActiveWorkspaceCookie(workspaceId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, activeWorkspaceCookieOptions());
}

/**
 * Points both cookies at a new place. Switching organization always picks a
 * workspace too: an id from the previous organization means nothing in the new one.
 */
export async function setActiveOrganizationCookies(organizationId: string, workspaceId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, activeWorkspaceCookieOptions());
  store.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, activeWorkspaceCookieOptions());
}

export async function clearActiveWorkspaceCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_WORKSPACE_COOKIE);
  store.delete(ACTIVE_ORGANIZATION_COOKIE);
}

export async function readActiveWorkspaceCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
}

export async function readActiveOrganizationCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
}
