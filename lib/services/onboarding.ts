/**
 * The welcome questionnaire, stored on the workspace it describes.
 *
 * Answers are advisory: nothing in the product refuses to work without them,
 * and the flow can be skipped. They exist so the template gallery and the
 * dashboard can lead with what this particular account is trying to do.
 */
import { prisma } from "@/lib/db";
import { sanitizeAnswers, type Answers } from "@/lib/onboarding/questions";

export type OnboardingState = {
  answers: Answers;
  /** Whether a channel is connected, which is what unlocks the usage questions. */
  hasChannel: boolean;
  completedAt: Date | null;
};

export async function getOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const [workspace, channelCount] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingAnswers: true, onboardingCompletedAt: true },
    }),
    prisma.channel.count({ where: { workspaceId } }),
  ]);

  return {
    answers: sanitizeAnswers(workspace?.onboardingAnswers),
    hasChannel: channelCount > 0,
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

/** Marks the questionnaire done, whether it was finished or skipped. */
export async function completeOnboarding(workspaceId: string): Promise<void> {
  await prisma.workspace.updateMany({
    where: { id: workspaceId, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
}
