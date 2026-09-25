import type { Job } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { refreshChannelTokenIfNeeded } from "@/lib/meta/tokens";

const payloadSchema = z.object({ channelId: z.string().min(1), force: z.boolean().optional() });

export async function handleRefreshToken(job: Job): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("refresh_token.bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  const channel = await prisma.channel.findUnique({ where: { id: parsed.data.channelId } });
  if (!channel) return;
  const result = await refreshChannelTokenIfNeeded(channel, { force: parsed.data.force });
  const meta = { channelId: channel.id, ...result, expiresAt: result.expiresAt?.toISOString() ?? null };
  // Every Facebook Page is checked daily and nearly all of them are fine; a dead token already logs its own warning.
  if (result.refreshed) logger.info("refresh_token.done", meta);
  else logger.debug("refresh_token.done", meta);
}
