"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { acceptInvitation, getOrganizationMembership } from "@/lib/services/organizations";
import { ApiError } from "@/lib/workspace/api";
import { setActiveOrganizationCookies } from "@/lib/workspace/cookie";

function tokenFrom(formData: FormData): string {
  const raw = formData.get("token");
  return typeof raw === "string" ? raw.slice(0, 128) : "";
}

/**
 * Accepts the invitation, opens the organization and lands on the dashboard.
 * Failures bounce back to the invite page with an `?error=` code so the page
 * can render the right explanation.
 */
export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = tokenFrom(formData);
  const invitePath = `/invite/${encodeURIComponent(token)}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(invitePath)}`);

  let target: { organizationId: string; workspaceId: string | null };
  try {
    const { organization, workspace } = await acceptInvitation(token, user.id);
    target = { organizationId: organization.id, workspaceId: workspace?.id ?? null };
  } catch (err) {
    const code = err instanceof ApiError ? (err.code ?? "UNKNOWN") : "UNKNOWN";
    if (!(err instanceof ApiError)) logger.error("invite.accept_failed", { userId: user.id, error: err });
    redirect(`${invitePath}?error=${encodeURIComponent(code)}`);
  }

  if (target.workspaceId) await setActiveOrganizationCookies(target.organizationId, target.workspaceId);
  redirect("/dashboard");
}

/** For users who are already members: just open the organization. */
export async function openOrganizationAction(formData: FormData): Promise<void> {
  const raw = formData.get("organizationId");
  const organizationId = typeof raw === "string" ? raw : "";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getOrganizationMembership(organizationId, user.id);
  if (!membership) redirect("/dashboard");

  const workspace = await prisma.workspace.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (workspace) await setActiveOrganizationCookies(organizationId, workspace.id);
  redirect("/dashboard");
}
