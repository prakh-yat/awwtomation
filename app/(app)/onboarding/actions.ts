"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createOrganization, organizationNameSchema } from "@/lib/services/organizations";
import { ApiError } from "@/lib/workspace/api";
import { setActiveOrganizationCookies } from "@/lib/workspace/cookie";

export type CreateOrganizationState = { error?: string };

/**
 * `useActionState` handler for the onboarding form. Returns a state object on
 * validation/server errors; on success it opens the new organization and goes
 * straight into connecting an account (step 2).
 */
export async function createOrganizationAction(_prev: CreateOrganizationState, formData: FormData): Promise<CreateOrganizationState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fonboarding");

  const raw = formData.get("name");
  const parsed = organizationNameSchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a name" };

  let ids: { organizationId: string; workspaceId: string };
  try {
    const { organization, workspace } = await createOrganization(user.id, { name: parsed.data });
    ids = { organizationId: organization.id, workspaceId: workspace.id };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    logger.error("onboarding.create_organization_failed", { userId: user.id, error: err });
    return { error: "We couldn't create your organization. Please try again." };
  }

  await setActiveOrganizationCookies(ids.organizationId, ids.workspaceId);
  redirect("/welcome");
}
