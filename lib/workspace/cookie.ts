import { cookies } from "next/headers";

/** Cookie holding the id of the workspace the user is currently working in. */
export const ACTIVE_WORKSPACE_COOKIE = "or_workspace";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Shared cookie attributes so the switch route, invite acceptance and
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

export async function clearActiveWorkspaceCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_WORKSPACE_COOKIE);
}

export async function readActiveWorkspaceCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
}
