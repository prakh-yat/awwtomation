/**
 * Emails an organization's owners and admins when one of its connected
 * accounts stops working. Until someone reconnects it, comments and DMs on it
 * get no automatic replies, and otherwise only the dashboard says so.
 *
 * One email per incident: `Channel.alertSentAt` is claimed before sending, so
 * a burst of jobs failing on the same dead token sends a single email, and it
 * is cleared whenever the account works again (reconnect, or a refresh that
 * succeeds). Never throws: callers are in the middle of handling the failure
 * that brought them here.
 */
import { ChannelPlatform, ChannelStatus, WorkspaceRole } from "@prisma/client";

import { brand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

/** An account in one of these states sends nothing until it is reconnected. */
const NEEDS_RECONNECT: ChannelStatus[] = [ChannelStatus.TOKEN_EXPIRED, ChannelStatus.ERROR];

export type ReconnectEmailChannel = {
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
  workspaceName: string;
};

/** "@shop" or "Shop Page", as the dashboard names it; null when Meta gave us neither. */
function accountHandle(channel: Pick<ReconnectEmailChannel, "username" | "name">): string | null {
  const username = channel.username?.trim().replace(/^@/, "");
  if (username) return `@${username}`;
  return channel.name?.trim() || null;
}

/**
 * What Meta's error means, for someone who has never seen a Graph error. The
 * error text is matched rather than its code: callers only keep the message.
 */
function plainReason(platform: ChannelPlatform, reason: string | null): string {
  const site = platform === ChannelPlatform.INSTAGRAM ? "Instagram" : "Facebook";
  const text = reason ?? "";
  if (/password/i.test(text)) return `${site} signed it out, usually after a password change or a security check.`;
  if (/checkpoint/i.test(text)) return `${site} wants the person who connected it to log in and complete a security check.`;
  if (/expired/i.test(text)) return `${site}'s sign-in for it expired.`;
  if (/not authori[sz]ed|deauthori[sz]ed|revoked/i.test(text)) return `Access for ${brand.name} was removed in ${site}'s settings.`;
  if (/logged out/i.test(text)) return `${site} ended the sign-in when the person who connected it logged out.`;
  if (/administrator|moderator/i.test(text)) return "The person who connected it no longer has a role on the Page.";
  return `${site} stopped accepting the connection.`;
}

/** Plain text, short lines, the account named in the subject so the email explains itself in an inbox list. */
export function reconnectEmail(channel: ReconnectEmailChannel, reason: string | null): { subject: string; text: string } {
  const instagram = channel.platform === ChannelPlatform.INSTAGRAM;
  const site = instagram ? "Instagram" : "Facebook";
  const noun = instagram ? "Instagram account" : "Facebook Page";
  const handle = accountHandle(channel);
  const subject = handle ? `Reconnect ${handle} on ${site}` : `Reconnect your ${noun}`;
  const text = [
    `Your ${noun}${handle ? ` ${handle}` : ""} stopped working in ${brand.name}.`,
    "",
    "Comments and DMs on it get no automatic replies until it is reconnected.",
    "",
    `Why: ${plainReason(channel.platform, reason)}`,
    "",
    `Workspace: ${channel.workspaceName}`,
    `Reconnect it here: ${appUrl("/dashboard?accounts=1")}`,
  ].join("\n");
  return { subject, text };
}

/**
 * Tells the owners and admins that `channelId` needs reconnecting, once per
 * incident. `reason` is the error that took the account down (Meta's message
 * as it came), turned into plain words for the email.
 */
export async function notifyChannelNeedsReconnect(channelId: string, reason?: string | null): Promise<void> {
  try {
    await notify(channelId, reason ?? null);
  } catch (err) {
    logger.error("channel_alert.error", { channelId, error: err instanceof Error ? err.message : String(err) });
  }
}

async function notify(channelId: string, reason: string | null): Promise<void> {
  const claimedAt = new Date();
  // Taken before sending so concurrent failures on one account can't each send an email.
  const claim = await prisma.channel.updateMany({
    where: { id: channelId, alertSentAt: null, status: { in: NEEDS_RECONNECT } },
    data: { alertSentAt: claimedAt },
  });
  // Already told about this incident, or the account works again (or is gone).
  if (claim.count === 0) return;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { platform: true, username: true, name: true, workspace: { select: { name: true, organizationId: true } } },
  });
  if (!channel) return;

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: channel.workspace.organizationId, role: { in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] } },
    select: { user: { select: { email: true } } },
  });
  const to = Array.from(new Set(members.map((m) => m.user.email.trim().toLowerCase()).filter(Boolean)));

  const email = reconnectEmail(
    { platform: channel.platform, username: channel.username, name: channel.name, workspaceName: channel.workspace.name },
    reason,
  );
  const result = await sendEmail({ to, ...email, tag: "channel-alert" });
  if (result.sent) {
    logger.info("channel_alert.sent", { channelId, recipients: to.length });
    return;
  }

  // Nothing went out: hand the claim back so a later failure on this account can try again.
  await prisma.channel.updateMany({ where: { id: channelId, alertSentAt: claimedAt }, data: { alertSentAt: null } });
  logger.info("channel_alert.not_sent", { channelId, reason: result.reason, recipients: to.length });
}
