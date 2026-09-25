/**
 * The welcome flow's answers, stored on the workspace they describe.
 *
 * Answers are advisory: nothing in the product refuses to work without them,
 * and the flow can be skipped. What each account is and what it should do is
 * asked when the account is connected, and stored on the channel instead
 * (lib/onboarding/account-questions.ts).
 */
import { prisma } from "@/lib/db";
import { sanitizeAnswers, type Answers } from "@/lib/onboarding/questions";

export type OnboardingState = {
  answers: Answers;
  completedAt: Date | null;
};

export async function getOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { onboardingAnswers: true, onboardingCompletedAt: true },
  });

  return {
    answers: sanitizeAnswers(workspace?.onboardingAnswers),
    completedAt: workspace?.onboardingCompletedAt ?? null,
  };
}

/**
 * Merges in what the user has answered so far. Saved on every step, so closing
 * the tab halfway through loses nothing.
 */
export async function saveOnboardingAnswers(workspaceId: string, input: unknown): Promise<Answers> {
  const incoming = sanitizeAnswers(input);
  const current = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { onboardingAnswers: true },
  });
  const merged = { ...sanitizeAnswers(current?.onboardingAnswers), ...incoming };
  await prisma.workspace.update({ where: { id: workspaceId }, data: { onboardingAnswers: merged } });
  return merged;
}

/** Marks the welcome flow done, whether it was finished or skipped. */
export async function completeOnboarding(workspaceId: string): Promise<void> {
  await prisma.workspace.updateMany({
    where: { id: workspaceId, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
}
