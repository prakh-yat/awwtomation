/**
 * The welcome flow's answers.
 *
 * What it asks about the workspace (who it is for) is stored on the workspace;
 * what it asks about the person (their role, how they heard about us) is
 * stored on the user, so setting up a second workspace does not ask again.
 *
 * Answers are advisory: nothing in the product refuses to work without them,
 * and the flow can be skipped. What each account is and what it should do is
 * asked when the account is connected, and stored on the channel instead
 * (lib/onboarding/account-questions.ts).
 */
import { prisma } from "@/lib/db";
import { sanitizeAnswers, sanitizeProfileAnswers, type Answers } from "@/lib/onboarding/questions";

export type OnboardingState = {
  /** The workspace's answers. */
  answers: Answers;
  /** The person's answers, from whichever welcome flow they went through. */
  profile: Answers;
  completedAt: Date | null;
};

export async function getOnboardingState(workspaceId: string, userId: string): Promise<OnboardingState> {
  const [workspace, user] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingAnswers: true, onboardingCompletedAt: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { profileAnswers: true } }),
  ]);

  return {
    answers: sanitizeAnswers(workspace?.onboardingAnswers),
    profile: sanitizeProfileAnswers(user?.profileAnswers),
    completedAt: workspace?.onboardingCompletedAt ?? null,
  };
}

/**
 * Merges in what has been answered so far, each answer onto the row it
 * describes. Saved on every step, so closing the tab halfway through loses
 * nothing. Anything that is not one of the welcome questions is dropped.
 */
export async function saveOnboardingAnswers(workspaceId: string, userId: string, input: unknown): Promise<void> {
  const workspaceAnswers = sanitizeAnswers(input);
  const profileAnswers = sanitizeProfileAnswers(input);

  const [workspace, user] = await Promise.all([
    Object.keys(workspaceAnswers).length > 0
      ? prisma.workspace.findUnique({ where: { id: workspaceId }, select: { onboardingAnswers: true } })
      : null,
    Object.keys(profileAnswers).length > 0 ? prisma.user.findUnique({ where: { id: userId }, select: { profileAnswers: true } }) : null,
  ]);

  await Promise.all([
    workspace
      ? prisma.workspace.update({
          where: { id: workspaceId },
          data: { onboardingAnswers: { ...sanitizeAnswers(workspace.onboardingAnswers), ...workspaceAnswers } },
        })
      : null,
    user
      ? prisma.user.update({
          where: { id: userId },
          data: { profileAnswers: { ...sanitizeProfileAnswers(user.profileAnswers), ...profileAnswers } },
        })
      : null,
  ]);
}

/** Marks the person's questions done, answered or skipped, so the app stops sending them to /welcome. */
export async function completeProfile(userId: string): Promise<void> {
  await prisma.user.updateMany({ where: { id: userId, profileCompletedAt: null }, data: { profileCompletedAt: new Date() } });
}

/** Marks the workspace's welcome questions done, whether they were finished or skipped. */
export async function completeOnboarding(workspaceId: string): Promise<void> {
  await prisma.workspace.updateMany({
    where: { id: workspaceId, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
}
