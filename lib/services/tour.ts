/**
 * The product tour's one piece of state: which version of it a person has
 * been shown.
 *
 * It lives on the User row rather than in the browser, so the tour opens once
 * per person whichever device they sign in on, invited members included.
 * Raising `TOUR_VERSION` opens the tour once more for everyone, which is how a
 * reworked tour reaches people who saw the old one.
 */
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/** 1: the dashboard tour that starts at Connect and walks the dock tile by tile. */
export const TOUR_VERSION = 1;

/** Whether this person has been shown the current tour. */
export function hasSeenCurrentTour(user: Pick<User, "tourVersion">): boolean {
  return user.tourVersion >= TOUR_VERSION;
}

/**
 * Records that a person has been shown the current tour.
 *
 * The tour marks itself the moment it opens, so a reload halfway through does
 * not start it again; a replay from the account menu changes nothing. Never
 * throws: a missed write only means the tour opens once more, which is no
 * reason to fail anything.
 */
export async function markTourSeen(userId: string): Promise<void> {
  try {
    await prisma.user.updateMany({
      where: { id: userId, tourVersion: { lt: TOUR_VERSION } },
      data: { tourVersion: TOUR_VERSION, tourCompletedAt: new Date() },
    });
  } catch (error) {
    logger.error("tour.mark_seen_failed", { userId, error });
  }
}
