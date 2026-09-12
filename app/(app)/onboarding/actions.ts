"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createWorkspace, workspaceNameSchema } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";
import { setActiveWorkspaceCookie } from "@/lib/workspace/cookie";

export type CreateWorkspaceState = { error?: string };

/**
 * `useActionState` handler for the onboarding form. Returns a state object on
 * validation/server errors; on success it sets the active cookie and redirects
 * straight into channel setup (step 2).
 */
export async function createWorkspaceAction(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fonboarding");

  const raw = formData.get("name");
  const parsed = workspaceNameSchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a workspace name" };

  let workspaceId: string;
  try {
    const workspace = await createWorkspace(user.id, parsed.data);
    workspaceId = workspace.id;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    logger.error("onboarding.create_workspace_failed", { userId: user.id, error: err });
    return { error: "We couldn't create your workspace. Please try again." };
  }

  await setActiveWorkspaceCookie(workspaceId);
  redirect("/channels?onboarding=1");
}
