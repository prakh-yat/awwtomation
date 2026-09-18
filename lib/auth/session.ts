import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { devAuthEmail } from "@/lib/auth/dev";
import { type GoogleIdentity, googleAuthId } from "@/lib/auth/google";
import { signSession, verifySession } from "@/lib/auth/token";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { clearActiveWorkspaceCookie } from "@/lib/workspace/cookie";

/** "vikas.shrestha@example.com" -> "Vikas Shrestha", so the dev sign-in shows a real-looking name. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type Profile = { email: string; name: string | null; avatarUrl: string | null };

/**
 * Mirrors an external identity into our `User` table.
 *
 * Insert on first sight; afterwards only write when something the provider told
 * us actually changed, so the common path stays read-only. The
 * email-uniqueness fallback re-links an existing person to a new `authId`
 * rather than crashing on the unique constraint: which is exactly what happens
 * the first time an account that was created under Supabase auth signs in
 * through Google directly.
 */
async function syncUser(authId: string, profile: Profile): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { authId } });

  if (existing) {
    const changed =
      existing.email !== profile.email ||
      existing.name !== profile.name ||
      existing.avatarUrl !== profile.avatarUrl;
    if (!changed) return existing;
    return prisma.user.update({ where: { id: existing.id }, data: profile });
  }

  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    logger.warn("auth.relink_auth_id", { userId: byEmail.id, from: byEmail.authId, to: authId });
    return prisma.user.update({ where: { id: byEmail.id }, data: { ...profile, authId } });
  }

  const created = await prisma.user.create({ data: { authId, ...profile } });
  logger.info("auth.user_created", { userId: created.id, email: created.email });
  return created;
}

/** Called by the OAuth callback once Google's identity has been verified. */
export async function syncGoogleUser(identity: GoogleIdentity): Promise<User> {
  return syncUser(googleAuthId(identity.subject), {
    email: identity.email,
    name: identity.name,
    avatarUrl: identity.avatarUrl,
  });
}

/** Writes the signed session cookie. Route handlers / server actions only. */
export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions());
}

/**
 * The signed-in application user, or null. Verifies the session cookie's
 * signature and expiry, then loads the row. Cached per request via `React.cache`.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Local development without Google credentials: see lib/auth/dev.ts for the gate.
  const devEmail = devAuthEmail();
  if (devEmail) {
    return syncUser(`dev:${devEmail}`, {
      email: devEmail,
      name: process.env.DEV_AUTH_NAME?.trim() || nameFromEmail(devEmail),
      avatarUrl: null,
    });
  }

  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  // A valid cookie for a deleted account: treat as signed out rather than 500.
  return prisma.user.findUnique({ where: { id: payload.uid } });
});

/** Page guard: redirects to `/login` when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Ends the session and forgets the active workspace. Only callable where
 * cookies can be written (route handlers / server actions).
 */
export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  await clearActiveWorkspaceCookie();
}
