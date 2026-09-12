"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { acceptInvitation, getMembership } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";
import { setActiveWorkspaceCookie } from "@/lib/workspace/cookie";

function tokenFrom(formData: FormData): string {
  const raw = formData.get("token");
  return typeof raw === "string" ? raw.slice(0, 128) : "";
}

/**
 * Accepts the invitation, makes the workspace active and lands on the
 * dashboard. Failures bounce back to the invite page with an `?error=` code
 * so the page can render the right explanation.
 */
export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = tokenFrom(formData);
  const invitePath = `/invite/${encodeURIComponent(token)}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(invitePath)}`);

  let workspaceId: string;
  try {
    const { workspace } = await acceptInvitation(token, user.id);
    workspaceId = workspace.id;
  } catch (err) {
    const code = err instanceof ApiError ? (err.code ?? "UNKNOWN") : "UNKNOWN";
    if (!(err instanceof ApiError)) logger.error("invite.accept_failed", { userId: user.id, error: err });
    redirect(`${invitePath}?error=${encodeURIComponent(code)}`);
  }

  await setActiveWorkspaceCookie(workspaceId);
  redirect("/dashboard");
}

/** For users who are already members: just switch to the workspace. */
export async function openWorkspaceAction(formData: FormData): Promise<void> {
  const raw = formData.get("workspaceId");
  const workspaceId = typeof raw === "string" ? raw : "";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getMembership(workspaceId, user.id);
  if (!membership) redirect("/dashboard");

  await setActiveWorkspaceCookie(workspaceId);
  redirect("/dashboard");
}
