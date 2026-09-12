/**
 * Demo seed — creates a realistic "Demo Studio" workspace so the dashboard,
 * inbox, contacts, logs and analytics have data on first run and for sales demos.
 *
 *   npm run db:seed                 # demo@awwtomation.local (super admin)
 *   SEED_EMAIL=you@x.com npm run db:seed
 *
 * Idempotent: re-running wipes and recreates the demo workspace only.
 * Tokens are fake (encrypted placeholders) — the demo channels cannot send.
 */
import "dotenv/config";
import {
  PrismaClient,
  ChannelPlatform,
  DeliveryKind,
  DeliveryStatus,
  MessageDirection,
  JobStatus,
  JobType,
} from "@prisma/client";
import { encrypt } from "../lib/crypto";
import { defaultFlow, type FlowGraph } from "../lib/automation/flow-types";

const prisma = new PrismaClient();

// Deterministic PRNG so the demo looks the same every run.
let seed = 20260906;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function int(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function daysAgo(days: number, hourJitter = true): Date {
  const now = new Date();
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  if (hourJitter) d.setUTCHours(int(6, 22), int(0, 59), int(0, 59), 0);
  // Never produce a timestamp in the future ("in 3 hours" looks broken in demos).
  if (d.getTime() > now.getTime()) d.setTime(now.getTime() - int(1, 120) * 60_000);
  return d;
}

const FIRST = ["Aarav", "Sita", "Bikash", "Priya", "Nabin", "Anisha", "Rohan", "Maya", "Suman", "Rita", "Kiran", "Nisha", "Dipesh", "Sarah", "Liam", "Emma", "Noah", "Olivia", "Arjun", "Sneha"];
const LAST = ["Shrestha", "Thapa", "Gurung", "Rai", "Karki", "Adhikari", "Tamang", "Magar", "Patel", "Khan", "Smith", "Lee", "Sharma", "Basnet", "Poudel"];
const CAPTIONS = [
  "New drop is live 🔥 Comment LINK for early access",
  "How I plan a week of content in 30 minutes — comment GUIDE",
  "Behind the scenes of the Pokhara shoot ✨",
  "3 tools I use every day. Comment TOOLS and I'll DM you the list",
  "Giveaway time! Comment WIN to enter 🎁",
  "Free template for reels hooks — comment TEMPLATE",
  "Q&A: ask me anything about growing on Instagram",
  "Our story so far. Thank you for 50k 🙏",
];

function followGateFlow(): FlowGraph {
  return {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { type: "trigger" } },
      { id: "gate", type: "condition_follow", position: { x: 0, y: 160 }, data: { type: "condition_follow", retryPrompt: "Follow us first, then tap below 👇" } },
      {
        id: "msg_yes",
        type: "send_message",
        position: { x: -220, y: 340 },
        data: { type: "send_message", message: { text: "Thanks for following, {{first_name}}! Here's your guide 👇", buttons: [{ type: "web_url", title: "Open guide", url: "https://example.com/guide" }] } },
      },
      {
        id: "msg_no",
        type: "send_message",
        position: { x: 220, y: 340 },
        data: { type: "send_message", message: { text: "Hey {{first_name}}! Follow @demo.studio to unlock the guide, then tap the button.", buttons: [{ type: "postback", title: "I followed ✓", payload: "follow_check:gate" }] } },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "gate", sourceHandle: "next" },
      { id: "e2", source: "gate", target: "msg_yes", sourceHandle: "yes" },
      { id: "e3", source: "gate", target: "msg_no", sourceHandle: "no" },
    ],
  };
}

async function main() {
  const email = (process.env.SEED_EMAIL ?? "demo@awwtomation.local").toLowerCase();

  const existing = await prisma.workspace.findUnique({ where: { slug: "demo-studio" } });
  if (existing) await prisma.workspace.delete({ where: { id: existing.id } });

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { supabaseId: `seed:${email}`, email, name: "Demo Owner", isSuperAdmin: true },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Studio",
      slug: "demo-studio",
      plan: "PRO",
      timezone: "Asia/Kathmandu",
      onboardedAt: daysAgo(40),
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  const ig = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      platform: ChannelPlatform.INSTAGRAM,
      externalId: "17841400000000001",
      username: "demo.studio",
      name: "Demo Studio",
      accessTokenEnc: encrypt("demo-token-not-real"),
      tokenExpiresAt: daysAgo(-52),
      scopes: ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"],
      status: "ACTIVE",
      webhookSubscribed: true,
      followerCount: 52_340,
      lastSyncedAt: daysAgo(0),
      connectedById: user.id,
    },
  });
  const fb = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      platform: ChannelPlatform.FACEBOOK,
      externalId: "100000000000002",
      username: "demostudio",
      name: "Demo Studio Page",
      accessTokenEnc: encrypt("demo-page-token-not-real"),
      scopes: ["pages_messaging", "pages_manage_engagement"],
      status: "ACTIVE",
      webhookSubscribed: true,
      followerCount: 8_120,
      lastSyncedAt: daysAgo(0),
      connectedById: user.id,
    },
  });

  const media = await Promise.all(
    CAPTIONS.map((caption, i) =>
      prisma.media.create({
        data: {
          channelId: ig.id,
          externalId: `1800000000000${i}`,
          caption,
          mediaType: i % 3 === 0 ? "VIDEO" : "IMAGE",
          permalink: `https://www.instagram.com/p/demo${i}/`,
          timestamp: daysAgo(30 - i * 3),
          commentCount: int(40, 900),
          likeCount: int(500, 12000),
        },
      })
    )
  );

  const link = (flow: FlowGraph, url: string): FlowGraph => ({
    ...flow,
    nodes: flow.nodes.map((n) =>
      n.data.type === "send_message"
        ? { ...n, data: { ...n.data, message: { ...n.data.message, buttons: [{ type: "web_url", title: "Open link", url }] } } }
        : n
    ),
  });

  const automations = await Promise.all([
    prisma.automation.create({ data: { workspaceId: workspace.id, channelId: ig.id, name: "Early access · LINK", status: "ACTIVE", triggerType: "COMMENT", matchMode: "CONTAINS", keywords: ["link", "early access"], mediaIds: [media[0].externalId], flow: link(defaultFlow(), "https://example.com/drop") as object, publicReplyEnabled: true, publicReplies: ["Sent you a DM 📩", "Check your inbox!", "DM'd you 🙌"], oncePerContact: true, triggeredCount: 0, sentCount: 0, createdAt: daysAgo(28) } }),
    prisma.automation.create({ data: { workspaceId: workspace.id, channelId: ig.id, name: "Content guide · follow gate", status: "ACTIVE", triggerType: "COMMENT", matchMode: "EXACT", keywords: ["guide"], mediaIds: [media[1].externalId], flow: followGateFlow() as object, publicReplyEnabled: false, oncePerContact: true, createdAt: daysAgo(21) } }),
    prisma.automation.create({ data: { workspaceId: workspace.id, channelId: ig.id, name: "Tools list · all posts", status: "PAUSED", triggerType: "COMMENT", matchMode: "CONTAINS", keywords: ["tools"], mediaIds: [], flow: link(defaultFlow(), "https://example.com/tools") as object, publicReplyEnabled: true, publicReplies: ["Sent! 📩"], createdAt: daysAgo(14) } }),
    prisma.automation.create({ data: { workspaceId: workspace.id, channelId: fb.id, name: "Giveaway entry (draft)", status: "DRAFT", triggerType: "COMMENT", matchMode: "ANY", keywords: [], mediaIds: [], flow: link(defaultFlow(), "https://example.com/giveaway") as object, createdAt: daysAgo(3) } }),
  ]);

  // Contacts spread over 30 days.
  const contacts = [];
  for (let i = 0; i < 70; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const username = `${first.toLowerCase()}.${last.toLowerCase()}${int(1, 99)}`;
    const last_ = daysAgo(int(0, 30));
    const isIg = rand() < 0.85;
    contacts.push(
      await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          channelId: isIg ? ig.id : fb.id,
          platform: isIg ? ChannelPlatform.INSTAGRAM : ChannelPlatform.FACEBOOK,
          externalId: `${isIg ? "ig" : "fb"}_${100000 + i}`,
          username,
          name: `${first} ${last}`,
          isFollower: rand() < 0.7,
          tags: [rand() < 0.5 ? "lead" : "engaged", ...(rand() < 0.3 ? ["giveaway"] : []), ...(rand() < 0.15 ? ["vip"] : [])],
          customFields: rand() < 0.3 ? { city: pick(["Kathmandu", "Pokhara", "Lalitpur", "Sydney"]) } : {},
          firstSeenAt: daysAgo(int(0, 40)),
          lastInteractionAt: last_,
          createdAt: last_,
        },
      })
    );
  }

  // Tracked links + clicks.
  const links = await Promise.all([
    prisma.trackedLink.create({ data: { workspaceId: workspace.id, automationId: automations[0].id, slug: "drop2026", label: "Drop early access", destinationUrl: "https://example.com/drop" } }),
    prisma.trackedLink.create({ data: { workspaceId: workspace.id, automationId: automations[1].id, slug: "guide01", label: "Content guide", destinationUrl: "https://example.com/guide" } }),
    prisma.trackedLink.create({ data: { workspaceId: workspace.id, slug: "bio", label: "Link in bio", destinationUrl: "https://example.com" } }),
  ]);

  // Delivery logs: ~500 events over 30 days, weighted toward SENT.
  const statuses: DeliveryStatus[] = [
    ...Array<DeliveryStatus>(80).fill(DeliveryStatus.SENT),
    DeliveryStatus.SKIPPED_DUPLICATE, DeliveryStatus.SKIPPED_DUPLICATE, DeliveryStatus.SKIPPED_DUPLICATE,
    DeliveryStatus.SKIPPED_NOT_FOLLOWING, DeliveryStatus.SKIPPED_NOT_FOLLOWING,
    DeliveryStatus.SKIPPED_SELF, DeliveryStatus.SKIPPED_WINDOW, DeliveryStatus.SKIPPED_RATE_LIMIT, DeliveryStatus.FAILED, DeliveryStatus.FAILED,
  ];
  const logs: { workspaceId: string; channelId: string; automationId: string; contactId: string; kind: DeliveryKind; status: DeliveryStatus; commentExternalId: string; recipientExternalId: string; recipientUsername: string; messagePreview: string; errorMessage: string | null; createdAt: Date }[] = [];
  let n = 0;
  for (let day = 30; day >= 0; day--) {
    const volume = int(8, 24) + (day < 7 ? 8 : 0);
    for (let k = 0; k < volume; k++) {
      const c = pick(contacts);
      const a = rand() < 0.6 ? automations[0] : rand() < 0.7 ? automations[1] : automations[2];
      const status = pick(statuses);
      logs.push({
        workspaceId: workspace.id,
        channelId: c.channelId,
        automationId: a.id,
        contactId: c.id,
        kind: DeliveryKind.PRIVATE_REPLY,
        status,
        commentExternalId: `c_${day}_${k}_${n++}`,
        recipientExternalId: c.externalId,
        recipientUsername: c.username ?? "",
        messagePreview: "Thanks for commenting! Here's your link 👇",
        errorMessage: status === DeliveryStatus.FAILED ? "(#10) Application does not have permission for this action" : null,
        createdAt: daysAgo(day),
      });
      if (a.publicReplyEnabled && status === DeliveryStatus.SENT && rand() < 0.9) {
        logs.push({ ...logs[logs.length - 1], kind: DeliveryKind.PUBLIC_REPLY, messagePreview: pick(a.publicReplies), errorMessage: null });
      }
    }
  }
  await prisma.deliveryLog.createMany({ data: logs });

  // One FlowSession per trigger (the analytics "Triggers" metric counts sessions).
  await prisma.flowSession.createMany({
    data: logs
      .filter((l) => l.kind === DeliveryKind.PRIVATE_REPLY)
      .map((l) => ({
        workspaceId: workspace.id,
        automationId: l.automationId,
        contactId: l.contactId,
        currentNodeId: null,
        status: l.status === DeliveryStatus.SENT ? "COMPLETED" : "EXPIRED",
        context: { commentId: l.commentExternalId, seeded: true },
        createdAt: l.createdAt,
        updatedAt: l.createdAt,
      })),
  });

  // Counters on automations.
  for (const a of automations) {
    const sent = logs.filter((l) => l.automationId === a.id && l.kind === DeliveryKind.PRIVATE_REPLY && l.status === DeliveryStatus.SENT).length;
    const triggered = logs.filter((l) => l.automationId === a.id && l.kind === DeliveryKind.PRIVATE_REPLY).length;
    await prisma.automation.update({ where: { id: a.id }, data: { sentCount: sent, triggeredCount: triggered, lastTriggeredAt: triggered ? daysAgo(0) : null } });
  }

  // Link clicks (~35% CTR on sent).
  const clicks = [];
  for (const l of logs) {
    if (l.kind === DeliveryKind.PRIVATE_REPLY && l.status === DeliveryStatus.SENT && rand() < 0.35) {
      const tl = l.automationId === automations[0].id ? links[0] : l.automationId === automations[1].id ? links[1] : links[2];
      clicks.push({ linkId: tl.id, contactId: l.contactId, userAgent: "Instagram 300.0 (iPhone)", createdAt: new Date(l.createdAt.getTime() + int(30, 3600) * 1000) });
    }
  }
  await prisma.linkClick.createMany({ data: clicks });
  for (const tl of links) {
    await prisma.trackedLink.update({ where: { id: tl.id }, data: { clickCount: clicks.filter((c) => c.linkId === tl.id).length } });
  }

  // Conversations for the 18 most recent contacts.
  const recent = [...contacts].sort((a, b) => (b.lastInteractionAt?.getTime() ?? 0) - (a.lastInteractionAt?.getTime() ?? 0)).slice(0, 18);
  for (const [i, c] of recent.entries()) {
    const lastInbound = c.lastInteractionAt ?? daysAgo(1);
    const convo = await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        channelId: c.channelId,
        contactId: c.id,
        status: i > 14 ? "CLOSED" : "OPEN",
        lastInboundAt: lastInbound,
        lastMessageAt: lastInbound,
        lastMessagePreview: pick(["Thanks! Got it 🙏", "Is the guide free?", "link pls", "Can I get the tools list too?", "❤️", "when is the drop?"]),
        unreadCount: i < 5 ? 1 : 0,
        assignedToId: i % 4 === 0 ? user.id : null,
      },
    });
    const t0 = lastInbound.getTime() - 5 * 60_000;
    await prisma.message.createMany({
      data: [
        { conversationId: convo.id, direction: MessageDirection.INBOUND, externalId: `m_in_${i}_0`, text: "LINK", createdAt: new Date(t0 - 60_000) },
        { conversationId: convo.id, direction: MessageDirection.OUTBOUND, externalId: `m_out_${i}_0`, text: "Thanks for commenting! Here's your link 👇", payload: { buttons: [{ type: "web_url", title: "Open link", url: "https://example.com/drop" }] }, automationId: automations[0].id, createdAt: new Date(t0) },
        { conversationId: convo.id, direction: MessageDirection.INBOUND, externalId: `m_in_${i}_1`, text: convo.lastMessagePreview ?? "Thanks!", createdAt: lastInbound },
      ],
    });
  }

  // One sent broadcast.
  await prisma.broadcast.create({
    data: {
      workspaceId: workspace.id,
      channelId: ig.id,
      name: "Drop reminder · engaged",
      message: { text: "The drop goes live in 1 hour ⏰ Tap below to get in first.", buttons: [{ type: "web_url", title: "Get early access", url: "https://example.com/drop" }] },
      audience: { tags: ["engaged"], excludeTags: [], onlyFollowers: false, onlyInWindow: true },
      status: "SENT",
      startedAt: daysAgo(2),
      completedAt: daysAgo(2),
      targetCount: 14,
      sentCount: 12,
      failedCount: 0,
      skippedCount: 2,
      createdAt: daysAgo(2),
    },
  });

  // Queue history + a couple of webhook receipts for the admin panel.
  await prisma.job.createMany({
    data: [
      { workspaceId: workspace.id, type: JobType.EXECUTE_FLOW, payload: { sessionId: "demo", nodeId: "msg" }, status: JobStatus.COMPLETED, attempts: 1, runAt: daysAgo(0), lockedAt: daysAgo(0), lockedBy: "worker-demo" },
      { workspaceId: workspace.id, type: JobType.PUBLIC_REPLY, payload: { automationId: automations[0].id, channelId: ig.id, commentId: "c_demo" }, status: JobStatus.COMPLETED, attempts: 1, runAt: daysAgo(0) },
      { workspaceId: workspace.id, type: JobType.REFRESH_TOKEN, payload: { channelId: ig.id }, status: JobStatus.COMPLETED, attempts: 1, runAt: daysAgo(1) },
      { workspaceId: workspace.id, type: JobType.EXECUTE_FLOW, payload: { sessionId: "demo2", nodeId: "msg" }, status: JobStatus.FAILED, attempts: 5, maxAttempts: 5, lastError: "MetaApiError: (#10) Application does not have permission for this action", runAt: daysAgo(1) },
    ],
  });
  await prisma.webhookEvent.deleteMany({ where: { dedupeKey: { startsWith: "demo:" } } });
  await prisma.webhookEvent.createMany({
    data: [
      { platform: ChannelPlatform.INSTAGRAM, dedupeKey: "demo:comment:1", field: "comments", payload: { object: "instagram", demo: true }, processed: true, createdAt: daysAgo(0) },
      { platform: ChannelPlatform.INSTAGRAM, dedupeKey: "demo:message:1", field: "messages", payload: { object: "instagram", demo: true }, processed: true, createdAt: daysAgo(0) },
      { platform: ChannelPlatform.FACEBOOK, dedupeKey: "demo:feed:1", field: "feed", payload: { object: "page", demo: true }, processed: false, error: "Channel not found for page 100000000000009", createdAt: daysAgo(1) },
    ],
  });
  await prisma.auditLog.createMany({
    data: [
      { workspaceId: workspace.id, userId: user.id, action: "workspace.create", targetType: "workspace", targetId: workspace.id, createdAt: daysAgo(40) },
      { workspaceId: workspace.id, userId: user.id, action: "channel.connect", targetType: "channel", targetId: ig.id, metadata: { platform: "INSTAGRAM" }, createdAt: daysAgo(39) },
      { workspaceId: workspace.id, userId: user.id, action: "automation.activate", targetType: "automation", targetId: automations[0].id, createdAt: daysAgo(28) },
    ],
  });

  await prisma.workspace.update({ where: { id: workspace.id }, data: { dmsSentThisPeriod: logs.filter((l) => l.kind === DeliveryKind.PRIVATE_REPLY && l.status === DeliveryStatus.SENT && l.createdAt.getUTCMonth() === new Date().getUTCMonth()).length } });

  console.log(`Seeded workspace "Demo Studio" for ${email}: ${contacts.length} contacts, ${logs.length} delivery logs, ${clicks.length} clicks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
