"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { markTourSeen } from "@/lib/services/tour";

/**
 * Records that the signed-in person has been shown the product tour. The tour
 * calls it as it opens and does not wait for the answer, so it resolves
 * quietly whatever happens: signed out, or the write failed.
 */
export async function markTourSeenAction(): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (user) await markTourSeen(user.id);
  } catch (error) {
    logger.error("tour.mark_seen_action_failed", { error });
  }
}
