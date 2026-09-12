"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { timezoneSchema, updateWorkspace, workspaceNameSchema } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";
import { ForbiddenError, getWorkspaceContext, requireRole } from "@/lib/workspace/context";

export type UpdateWorkspaceResult =
  | { ok: true; name: string }
  | { ok: false; error: string; field?: "name" | "timezone" };

const generalSchema = z.object({ name: workspaceNameSchema, timezone: timezoneSchema });

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/**
 * Saves the General settings form. Returns a result object instead of
 * throwing so the client can toast and highlight the offending field.
 * `updateWorkspace` itself does not check roles, so the ADMIN gate here is
 * load-bearing — never call it without `requireRole`.
 */
export async function updateWorkspaceAction(formData: FormData): Promise<UpdateWorkspaceResult> {
  const ctx = await getWorkspaceContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Sign in again to continue." };

  try {
    requireRole(ctx, "ADMIN");
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "Only admins can change workspace settings." };
    throw err;
  }

  const parsed = generalSchema.safeParse({ name: text(formData, "name"), timezone: text(formData, "timezone") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Check the form and try again.",
      field: issue?.path[0] === "timezone" ? "timezone" : "name",
    };
  }

  try {
    const workspace = await updateWorkspace(ctx.workspace.id, parsed.data, ctx.user.id);
    // The sidebar switcher shows the workspace name, so refresh the whole
    // shell rather than just this page.
    revalidatePath("/", "layout");
    return { ok: true, name: workspace.name };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    logger.error("settings.update_workspace_failed", {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      error: err,
    });
    return { ok: false, error: "We couldn't save your changes. Please try again." };
  }
}
