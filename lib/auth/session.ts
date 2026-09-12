import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { cache } from "react";

import { devAuthEmail } from "@/lib/auth/dev";
import { prisma } from "@/lib/db";
import { superAdminEmails } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearActiveWorkspaceCookie } from "@/lib/workspace/cookie";

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

type GoogleProfile = { email: string; name: string | null; avatarUrl: string | null; isSuperAdmin: boolean };

/**
 * Mirrors the Supabase user into our `User` table.
 *
 * Insert on first sight; afterwards only write when something Google told us
 * actually changed, so the common path (every server render) stays read-only.
 * The email-uniqueness fallback handles a Supabase project being recreated:
 * same person, new `supabaseId` — we re-link rather than crash.
 */
async function syncUser(supabaseId: string, profile: GoogleProfile): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { supabaseId } });

  if (existing) {
    const changed =
      existing.email !== profile.email ||
      existing.name !== profile.name ||
      existing.avatarUrl !== profile.avatarUrl ||
      existing.isSuperAdmin !== profile.isSuperAdmin;
    if (!changed) return existing;
    return prisma.user.update({ where: { id: existing.id }, data: profile });
  }

  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    logger.warn("auth.relink_supabase_id", { userId: byEmail.id, from: byEmail.supabaseId, to: supabaseId });
    return prisma.user.update({ where: { id: byEmail.id }, data: { ...profile, supabaseId } });
  }

  const created = await prisma.user.create({ data: { supabaseId, ...profile } });
  logger.info("auth.user_created", { userId: created.id, email: created.email });
  return created;
}

/**
 * The signed-in application user, or null. Validates the session with
 * Supabase (`getUser`, not `getSession`) and upserts our own `User` row from
 * the Google profile. Cached per request via `React.cache`.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Local development without Supabase — see lib/auth/dev.ts for the gate.
  const devEmail = devAuthEmail();
  if (devEmail) {
    return syncUser(`dev:${devEmail}`, {
      email: devEmail,
      name: "Local Developer",
      avatarUrl: null,
      isSuperAdmin: superAdminEmails().includes(devEmail),
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) return null;

  const email = pickString(authUser.email)?.toLowerCase() ?? null;
  if (!email) {
    // Google always provides an email; if it's missing we can't key the account.
    logger.warn("auth.user_without_email", { supabaseId: authUser.id });
    return null;
  }

  const meta: Record<string, unknown> = authUser.user_metadata ?? {};
  const profile: GoogleProfile = {
    email,
    name: pickString(meta.full_name) ?? pickString(meta.name) ?? null,
    avatarUrl: pickString(meta.avatar_url) ?? pickString(meta.picture) ?? null,
    isSuperAdmin: superAdminEmails().includes(email),
  };

  try {
    return await syncUser(authUser.id, profile);
  } catch (err) {
    logger.error("auth.sync_user_failed", { supabaseId: authUser.id, error: err });
    throw err;
  }
});

/** Page guard: redirects to `/login` when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Ends the Supabase session and forgets the active workspace. Only callable
 * where cookies can be written (route handlers / server actions).
 */
export async function signOut(): Promise<void> {
  if (!devAuthEmail()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) logger.warn("auth.signout_failed", { error });
  }
  await clearActiveWorkspaceCookie();
}
