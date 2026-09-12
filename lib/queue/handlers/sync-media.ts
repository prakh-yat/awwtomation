import type { Job } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { syncChannelMedia } from "@/lib/services/channels";

const payloadSchema = z.object({ channelId: z.string().min(1) });

/** Refreshes the cached Media table for the post picker (implementation lives in the channels lane). */
export async function handleSyncMedia(job: Job): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("sync_media.bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  await syncChannelMedia(parsed.data.channelId);
}
