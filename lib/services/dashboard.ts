/**
 * Dashboard read models that don't belong to a single domain service: the
 * "needs attention" list and the short inbox preview. Everything here is
 * written for the customer, so copy is plain language and nothing exposes
 * internal state (token details, error payloads, ids).
 */
import { AutomationStatus, ChannelStatus, ConversationStatus, type Workspace, type WorkspaceRole } from "@prisma/client";

import { type BillingFields, graceEndsAt, serviceState } from "@/lib/billing/entitlements";
import type { OrganizationUsage } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import type { SkipReason } from "@/lib/services/analytics";
import { listConversations, type ConversationListItem } from "@/lib/services/inbox";
import { projectUsage } from "@/lib/services/usage-history";
import { canManageBilling } from "@/lib/workspace/permissions";

const DAY_MS = 86_400_000;
/** Instagram tokens refresh themselves at 10 days left; still being this close means the refresh failed. */
const TOKEN_ATTENTION_DAYS = 5;
const USAGE_ATTENTION_SHARE = 0.8;

export type AttentionTone = "critical" | "warning" | "neutral";

export type AttentionItem = {
  key: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  href: string;
  action: string;
};

export type AttentionInput = {
  workspace: Workspace;
  /** Billing state lives on the organization the workspace belongs to. */
  organization: BillingFields;
  role: WorkspaceRole;
  usage: OrganizationUsage;
  failed: number;
  skipReasons: SkipReason[];
  days: number;
};

const TONE_ORDER: Record<AttentionTone, number> = { critical: 0, warning: 1, neutral: 2 };

function handle(channel: { platform: string; username: string | null; name: string | null }): string {
  const username = channel.username?.trim().replace(/^@/, "");
  if (username) return `@${username}`;
  return channel.name?.trim() || (channel.platform === "INSTAGRAM" ? "your Instagram account" : "your Facebook Page");
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function shortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function waitingFor(since: Date, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - since.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.round(hours / 24), "day");
}

async function channelItems(workspaceId: string): Promise<AttentionItem[]> {
  const channels = await prisma.channel.findMany({
    where: { workspaceId, status: { not: ChannelStatus.DISCONNECTED } },
    select: { id: true, platform: true, username: true, name: true, status: true, webhookSubscribed: true, tokenExpiresAt: true },
    orderBy: { createdAt: "asc" },
  });

  const items: AttentionItem[] = [];
  for (const c of channels) {
    const who = handle(c);
    const platform = c.platform === "INSTAGRAM" ? "Instagram" : "Facebook";
    const daysLeft = c.tokenExpiresAt ? Math.ceil((c.tokenExpiresAt.getTime() - Date.now()) / DAY_MS) : null;
    if (c.status === ChannelStatus.TOKEN_EXPIRED || (daysLeft !== null && daysLeft <= 0)) {
      items.push({
        key: `channel-expired-${c.id}`,
        tone: "critical",
        title: `Reconnect ${who}`,
        detail: `${platform} signed this account out. Automations on it can't send until you reconnect.`,
        href: "/dashboard?accounts=1",
        action: "Reconnect",
      });
      continue;
    }
    if (c.status === ChannelStatus.ERROR) {
      items.push({
        key: `channel-error-${c.id}`,
        tone: "critical",
        title: `${who} isn't sending`,
        detail: "Messages from this account aren't going out. Reconnect it.",
        href: "/dashboard?accounts=1",
        action: "Reconnect",
      });
      continue;
    }
    if (!c.webhookSubscribed) {
      items.push({
        key: `channel-events-${c.id}`,
        tone: "warning",
        title: `${who} isn't receiving comments`,
        detail: "New comments and messages won't reach your automations until you reconnect.",
        href: "/dashboard?accounts=1",
        action: "Reconnect",
      });
      continue;
    }
    if (daysLeft !== null && daysLeft <= TOKEN_ATTENTION_DAYS) {
      items.push({
        key: `channel-expiring-${c.id}`,
        tone: "warning",
        title: daysLeft === 1 ? `${who} disconnects tomorrow` : `${who} disconnects in ${daysLeft} days`,
        detail: "Reconnect it to keep automations running.",
        href: "/dashboard?accounts=1",
        action: "Reconnect",
      });
    }
  }
  return items;
}

async function inboxItem(workspaceId: string): Promise<AttentionItem | null> {
  const where = { workspaceId, status: ConversationStatus.OPEN, unreadCount: { gt: 0 } } as const;
  const [unread, oldest] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findFirst({ where: { ...where, lastInboundAt: { not: null } }, orderBy: { lastInboundAt: "asc" }, select: { lastInboundAt: true } }),
  ]);
  if (unread === 0) return null;
  return {
    key: "inbox-unread",
    tone: "neutral",
    title: plural(unread, "unread conversation"),
    detail: oldest?.lastInboundAt ? `The oldest has been waiting ${waitingFor(oldest.lastInboundAt)}.` : "People are waiting for a reply.",
    href: "/inbox",
    action: "Reply",
  };
}

function billingItem(organization: BillingFields, role: WorkspaceRole): AttentionItem | null {
  if (!canManageBilling(role)) return null;
  const state = serviceState(organization);
  if (state === "none") {
    return {
      key: "billing-none",
      tone: "warning",
      title: "Choose a plan to start sending",
      detail: "You can connect accounts and build automations now. Nothing is sent until the organization has a plan.",
      href: "/settings/billing",
      action: "See plans",
    };
  }
  if (state === "lapsed") {
    return {
      key: "billing-lapsed",
      tone: "critical",
      title: "Your payment didn't go through",
      detail: "Nothing is sent until you update your payment method.",
      href: "/settings/billing",
      action: "Update",
    };
  }
  if (state === "grace") {
    const ends = graceEndsAt(organization);
    return {
      key: "billing-grace",
      tone: "warning",
      title: "Your last payment failed",
      detail: ends ? `Update your payment method by ${shortDate(ends)} to keep your current plan.` : "Update your payment method to keep your current plan.",
      href: "/settings/billing",
      action: "Update",
    };
  }
  if (state === "cancelling" && organization.currentPeriodEnd) {
    return {
      key: "billing-cancelling",
      tone: "neutral",
      title: `Your plan ends on ${shortDate(organization.currentPeriodEnd)}`,
      detail: "After that nothing is sent until you choose a plan again. You can resume before then.",
      href: "/settings/billing",
      action: "Review",
    };
  }
  return null;
}

function usageItem(usage: OrganizationUsage, role: WorkspaceRole, planLimited: number): AttentionItem | null {
  const { used, limit } = usage.dms;
  // No plan means no DM allowance at all; the billing notice already says so.
  if (limit === 0) return null;
  const href = canManageBilling(role) ? "/settings/billing" : "/usage";
  const action = canManageBilling(role) ? "Upgrade" : "View usage";

  if (limit > 0 && used >= limit) {
    return {
      key: "usage-exhausted",
      tone: "critical",
      title: "You've used all of this month's DMs",
      detail:
        planLimited > 0
          ? `${plural(planLimited, "DM")} weren't sent. Sending resumes on ${shortDate(usage.periodEnd)}.`
          : `New DMs won't go out until ${shortDate(usage.periodEnd)}.`,
      href,
      action,
    };
  }

  const projection = projectUsage({ used, limit, periodStart: usage.periodStart, periodEnd: usage.periodEnd });
  if (limit > 0 && projection.pct >= USAGE_ATTENTION_SHARE) {
    return {
      key: "usage-high",
      tone: "warning",
      title: `${Math.floor(projection.pct * 100)}% of this month's DMs used`,
      detail: `${(limit - used).toLocaleString("en-US")} left until the count resets on ${shortDate(usage.periodEnd)}.`,
      href,
      action,
    };
  }
  // A few days of data make for a wild projection; wait for a week before warning.
  if (projection.exhaustsAt && projection.daysElapsed >= 7) {
    return {
      key: "usage-pace",
      tone: "warning",
      title: `On pace to run out of DMs by ${shortDate(projection.exhaustsAt)}`,
      detail: `You're likely to send about ${projection.projected.toLocaleString("en-US")} this month. Your plan includes ${limit.toLocaleString("en-US")}.`,
      href,
      action,
    };
  }
  return null;
}

/**
 * Things an owner should act on, most urgent first. Only problems and pending
 * work: routine activity lives in the charts, not here.
 */
export async function getAttentionItems(input: AttentionInput): Promise<AttentionItem[]> {
  const { workspace, organization, role, usage, failed, skipReasons, days } = input;

  const [channels, inbox, activeAutomations, automations] = await Promise.all([
    channelItems(workspace.id),
    inboxItem(workspace.id),
    prisma.automation.count({ where: { workspaceId: workspace.id, status: AutomationStatus.ACTIVE } }),
    prisma.automation.count({ where: { workspaceId: workspace.id } }),
  ]);

  const items: AttentionItem[] = [...channels];

  const billing = billingItem(organization, role);
  if (billing) items.push(billing);

  const planLimited = skipReasons.find((r) => r.status === "SKIPPED_PLAN_LIMIT")?.count ?? 0;
  const usageAlert = usageItem(usage, role, planLimited);
  if (usageAlert) items.push(usageAlert);

  if (failed > 0) {
    items.push({
      key: "deliveries-failed",
      tone: "warning",
      title: `${plural(failed, "DM")} failed to send`,
      detail: `In the last ${days} days. Logs show what went wrong with each one.`,
      href: "/logs?status=FAILED",
      action: "Review",
    });
  }

  if (automations > 0 && activeAutomations === 0 && usage.channels.used > 0) {
    items.push({
      key: "automations-off",
      tone: "warning",
      title: "No automations are running",
      detail: "Comments and messages won't get a reply until you turn one on.",
      href: "/automations",
      action: "Open",
    });
  }

  if (inbox) items.push(inbox);

  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

export type RecentConversations = { items: ConversationListItem[]; open: number; unread: number };

/** The newest open threads for the dashboard preview. */
export async function getRecentConversations(workspaceId: string, viewerId: string, limit = 5): Promise<RecentConversations> {
  const base = { workspaceId, status: ConversationStatus.OPEN } as const;
  const [page, open, unread] = await Promise.all([
    listConversations(workspaceId, { status: ConversationStatus.OPEN, limit, viewerId }),
    prisma.conversation.count({ where: base }),
    prisma.conversation.count({ where: { ...base, unreadCount: { gt: 0 } } }),
  ]);
  return { items: page.items, open, unread };
}
