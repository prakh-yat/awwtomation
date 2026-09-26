"use server";

import { revalidatePath } from "next/cache";

import { completeOnboarding, completeProfile, saveOnboardingAnswers } from "@/lib/services/onboarding";
import { requireWorkspaceContext } from "@/lib/workspace/context";

/**
 * Saves what has been answered so far. Called on every step rather than at the
 * end, so closing the tab halfway through loses nothing.
 */
export async function saveAnswers(answers: unknown): Promise<void> {
  const ctx = await requireWorkspaceContext();
  await saveOnboardingAnswers(ctx.workspace.id, ctx.user.id, answers);
}

/**
 * Finishes the welcome flow, whether it was completed, skipped or the plan
 * left for later: neither the person's questions nor the workspace's are
 * asked again.
 */
export async function finishOnboarding(answers: unknown): Promise<void> {
  const ctx = await requireWorkspaceContext();
  await saveOnboardingAnswers(ctx.workspace.id, ctx.user.id, answers);
  await Promise.all([completeOnboarding(ctx.workspace.id), completeProfile(ctx.user.id)]);
  revalidatePath("/", "layout");
}
