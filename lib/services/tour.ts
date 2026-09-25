/**
 * The product tour's one piece of state: whether a person has been shown it.
 *
 * It lives on the User row rather than in the browser, so the tour opens once
 * per person whichever device they sign in on, invited members included.
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Records that a person has been shown the tour.
 *
 * First write wins: the date is only set where it is still empty, so the tour
 * can mark itself the moment it opens and a replay from the account menu never
 * moves it. Never throws: a missed write only means the tour opens once more,
 * which is no reason to fail anything.
 */
export async function markTourSeen(userId: string): Promise<void> {
  try {
    await prisma.user.updateMany({
      where: { id: userId, tourCompletedAt: null },
      data: { tourCompletedAt: new Date() },
    });
  } catch (error) {
    logger.error("tour.mark_seen_failed", { userId, error });
  }
}
