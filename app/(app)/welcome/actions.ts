"use server";

import { revalidatePath } from "next/cache";

import { completeOnboarding, saveOnboardingAnswers } from "@/lib/services/onboarding";
import { requireWorkspaceContext } from "@/lib/workspace/context";

/**
 * Saves what has been answered so far. Called on every step rather than at the
 * end, so closing the tab halfway through loses nothing.
 */
export async function saveAnswers(answers: unknown): Promise<void> {
  const ctx = await requireWorkspaceContext();
  await saveOnboardingAnswers(ctx.workspace.id, answers);
}

/** Finishes the questionnaire, whether the last question was answered or skipped. */
export async function finishOnboarding(answers: unknown): Promise<void> {
  const ctx = await requireWorkspaceContext();
  await saveOnboardingAnswers(ctx.workspace.id, answers);
  await completeOnboarding(ctx.workspace.id);
  revalidatePath("/dashboard");
}
