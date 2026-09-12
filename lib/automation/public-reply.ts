import { AutomationStatus, ChannelPlatform, ChannelStatus, DeliveryKind, DeliveryStatus, type Job } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { replyToFacebookComment } from "@/lib/meta/facebook";
import { replyToInstagramComment } from "@/lib/meta/instagram";
import { getChannelToken, markChannelTokenExpired } from "@/lib/meta/tokens";
import { MetaApiError, MetaRateLimitError, MetaTokenError } from "@/lib/meta/types";
import { renderTemplate } from "./flow-types";
import { contactTemplateVars, recordDeliveryLog } from "./send";

export const publicReplyPayloadSchema = z.object({
  automationId: z.string().min(1),
  channelId: z.string().min(1),
  commentId: z.string().min(1),
  contactId: z.string().optional(),
});

function pickReply(replies: string[]): string | null {
  const usable = replies.map((r) => r.trim()).filter(Boolean);
  if (usable.length === 0) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}

/**
 * Reply publicly under the triggering comment with one of the automation's
 * canned replies (random pick so threads don't look robotic). One per comment.
 */
export async function sendPublicReply(job: Job): Promise<void> {
  const parsed = publicReplyPayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("public_reply.bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  const { automationId, channelId, commentId, contactId } = parsed.data;

  const automation = await prisma.automation.findFirst({ where: { id: automationId, channelId }, include: { channel: true } });
  if (!automation) return;
  const channel = automation.channel;
  if (automation.status !== AutomationStatus.ACTIVE || !automation.publicReplyEnabled) return;
  if (channel.status !== ChannelStatus.ACTIVE) return;

  const already = await prisma.deliveryLog.findFirst({
    where: { automationId, commentExternalId: commentId, kind: DeliveryKind.PUBLIC_REPLY },
    select: { id: true },
  });
  if (already) return;

  const contact = contactId ? await prisma.contact.findFirst({ where: { id: contactId, channelId } }) : null;
  const template = pickReply(automation.publicReplies);
  if (!template) return;
  const text = renderTemplate(template, contact ? contactTemplateVars(contact) : {});

  const base = {
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    automationId,
    contactId: contact?.id,
    kind: DeliveryKind.PUBLIC_REPLY,
    commentExternalId: commentId,
    recipientExternalId: contact?.externalId,
    recipientUsername: contact?.username,
    messagePreview: text.slice(0, 140),
  };

  try {
    const token = getChannelToken(channel);
    const res =
      channel.platform === ChannelPlatform.INSTAGRAM
        ? await replyToInstagramComment(token, commentId, text)
        : await replyToFacebookComment(token, commentId, text);
    await recordDeliveryLog({ ...base, status: DeliveryStatus.SENT, metaResponse: { id: res.id } });
    logger.info("public_reply.sent", { automationId, commentId, replyId: res.id });
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(channel.id, err.message);
      await recordDeliveryLog({ ...base, status: DeliveryStatus.FAILED, errorMessage: err.message });
      return;
    }
    // Throttled or transient: let the queue retry with backoff.
    if (err instanceof MetaRateLimitError || (err instanceof MetaApiError && err.retryable) || !(err instanceof MetaApiError)) throw err;
    await recordDeliveryLog({ ...base, status: DeliveryStatus.FAILED, errorMessage: err.message, metaResponse: { code: err.code ?? null, subcode: err.subcode ?? null } });
  }
}
