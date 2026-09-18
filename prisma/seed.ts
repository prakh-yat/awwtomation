/**
 * Demo data for local development, sales demos and design screenshots.
 *
 *   npm run db:local          # embedded Postgres on 127.0.0.1:5433
 *   npm run db:seed           # this script
 *
 * Creates these organizations for demo@awwtomation.local (sign in locally with
 * DEV_AUTH_EMAIL=demo@awwtomation.local):
 *   - Himalayan Threads        Pro, a team of three. Workspaces: Himalayan Threads (two
 *                              accounts, 150 days of activity, sales and wholesale
 *                              pipelines) and Himalayan Threads Kids (empty)
 *   - Everest Coffee Roasters  Starter, one account, lighter activity
 *   - Kathmandu Fitness Club   Free, nothing connected yet (the demo user is an admin)
 * plus Annapurna Trekking Co., someone else's organization with a pending
 * invitation for the demo user.
 *
 * Re-running replaces those organizations. Tokens are placeholders, so the demo
 * accounts can't actually send. It refuses to run against anything but a local
 * database unless SEED_ALLOW_REMOTE=1 — this data must never land in production.
 */
import "dotenv/config";

import {
  ChannelPlatform,
  DeliveryKind,
  DeliveryStatus,
  MessageDirection,
  PrismaClient,
  type PlanTier,
  type Prisma,
} from "@prisma/client";

import { renderTemplate, validateFlow, type FlowGraph, type FlowNode } from "../lib/automation/flow-types";
import { encrypt } from "../lib/crypto";
import { DEFAULT_PIPELINE_NAME, DEFAULT_STAGES, type StageColor } from "../lib/pipelines/colors";

// ───────────────────────── Safety ─────────────────────────

const dbUrl = process.env.DATABASE_URL ?? "";
const isLocal = /@(127\.0\.0\.1|localhost|postgres|db)(:\d+)?\//.test(dbUrl);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(
    "Refusing to seed: DATABASE_URL is not a local database.\n" +
      "Demo data must never reach a real workspace. Point DATABASE_URL at `npm run db:local`,\n" +
      "or set SEED_ALLOW_REMOTE=1 if you really mean it.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// ───────────────────────── Deterministic randomness ─────────────────────────

let state = 20260913;
function rand(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const chance = (p: number) => rand() < p;
function weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
/** cuid-shaped ids, so seeded records look like real ones in URLs. */
const cid = () => "c" + Array.from({ length: 24 }, () => ID_CHARS[Math.floor(rand() * ID_CHARS.length)]).join("");

// ───────────────────────── Time (Asia/Kathmandu, UTC+5:45) ─────────────────────────

const NPT_OFFSET_MS = (5 * 60 + 45) * 60_000;
const NOW = new Date();
/** Stable so design screenshots can open /invite/<token> without looking it up. */
const DEMO_INVITE_TOKEN = "demo-invite-annapurna-trekking-co-7f3a9c2e41b8";

/** A moment `daysAgo` days back at a local Kathmandu wall-clock time, never in the future. */
function nptTime(daysAgo: number, hour: number, minute = int(0, 59)): Date {
  const local = new Date(NOW.getTime() + NPT_OFFSET_MS);
  const utc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysAgo, hour, minute, int(0, 59)) - NPT_OFFSET_MS;
  return new Date(Math.min(utc, NOW.getTime() - int(2, 90) * 60_000));
}
/** `min` minutes after `d`, pulled back before "now" by a random margin so recent events don't all read "1 minute ago". */
const minutesAfter = (d: Date, min: number) => {
  const latest = NOW.getTime() - int(2, 45) * 60_000;
  const at = Math.max(Math.min(d.getTime() + min * 60_000, latest), d.getTime() + 20_000);
  return new Date(Math.min(at, NOW.getTime() - 30_000));
};
/** Local day of week, 0 = Sunday. */
const localDow = (daysAgo: number) => new Date(NOW.getTime() + NPT_OFFSET_MS - daysAgo * 86_400_000).getUTCDay();

// Instagram activity in Nepal: quiet overnight, a lunch bump, a strong evening.
const HOUR_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [0, 3], [1, 1], [2, 1], [3, 0.5], [4, 0.5], [5, 1], [6, 2], [7, 4], [8, 6], [9, 7], [10, 8], [11, 9],
  [12, 11], [13, 12], [14, 9], [15, 8], [16, 9], [17, 11], [18, 15], [19, 19], [20, 22], [21, 20], [22, 13], [23, 7],
];
// Nepal's weekend is Saturday; Friday evening and Saturday are busiest.
const DOW_FACTOR = [1.0, 0.85, 0.88, 0.92, 1.0, 1.22, 1.35];

// ───────────────────────── People ─────────────────────────

const FIRST = ["Aarav", "Sita", "Bikash", "Priya", "Nabin", "Anisha", "Rohan", "Maya", "Suman", "Rita", "Kiran", "Nisha", "Dipesh", "Pooja", "Sagar", "Asmita", "Prakash", "Sneha", "Roshan", "Kabita", "Aayush", "Samjhana", "Bibek", "Srijana", "Nirajan", "Pratiksha", "Sujan", "Manisha", "Rajesh", "Sabina", "Ashok", "Bipana", "Sandesh", "Kritika", "Utsav", "Riya", "Anil", "Shristi", "Emma", "Liam"];
const LAST = ["Shrestha", "Thapa", "Gurung", "Rai", "Karki", "Adhikari", "Tamang", "Magar", "Maharjan", "Basnet", "Poudel", "Bhattarai", "Khadka", "Lama", "Sherpa", "Joshi", "Pandey", "Acharya", "KC", "Bajracharya", "Dahal", "Ghimire", "Neupane", "Chaudhary"];
const CITIES = ["Kathmandu", "Lalitpur", "Bhaktapur", "Pokhara", "Biratnagar", "Butwal", "Chitwan", "Dharan", "Birgunj", "Hetauda"];

// ───────────────────────── Flows ─────────────────────────

function n(id: string, x: number, y: number, data: FlowNode["data"]): FlowNode {
  return { id, type: data.type, position: { x, y }, data };
}
const e = (source: string, target: string, sourceHandle = "next") => ({ id: `e-${source}-${sourceHandle}-${target}`, source, target, sourceHandle });
const TRIGGER = n("trigger", 0, 0, { type: "trigger" });

function linkFlow(text: string, title: string, url: string): FlowGraph {
  return {
    nodes: [TRIGGER, n("message-1", 0, 170, { type: "send_message", message: { text, buttons: [{ type: "web_url", title, url }] } })],
    edges: [e("trigger", "message-1")],
  };
}

function followGateFlow(handle: string, url: string): FlowGraph {
  return {
    nodes: [
      TRIGGER,
      n("follow-1", 0, 170, { type: "condition_follow", retryPrompt: `Follow @${handle}, then tap the button to get the size guide.` }),
      n("message-link", -220, 340, {
        type: "send_message",
        message: { text: "Thanks for following, {{first_name|there}}. Here's the full size guide, with measurements for every style.", buttons: [{ type: "web_url", title: "Size guide", url }] },
      }),
      n("message-follow", 220, 340, {
        type: "send_message",
        message: { text: `The size guide is for followers. Follow @${handle}, then tap below and it's yours.`, buttons: [{ type: "postback", title: "I've followed", payload: "follow_check:follow-1" }] },
      }),
    ],
    edges: [e("trigger", "follow-1"), e("follow-1", "message-link", "yes"), e("follow-1", "message-follow", "no"), e("message-follow", "follow-1", "btn:0")],
  };
}

function wholesaleFlow(pipelines: SeedPipelines): FlowGraph {
  const wholesale = pipelines.wholesale;
  return {
    nodes: [
      TRIGGER,
      n("message-1", 0, 170, {
        type: "send_message",
        message: {
          text: "Namaste {{first_name|there}}. We supply boutiques across Nepal with a minimum order of 20 pieces. Tap below and we'll email you the wholesale price sheet.",
          buttons: [{ type: "postback", title: "Send the sheet", payload: "btn:0" }],
        },
      }),
      n("ask-email", 0, 340, {
        type: "ask_question",
        prompt: { text: "Which email should we send it to?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That doesn't look like an email address. Could you check it and send it again?",
        maxRetries: 2,
      }),
      n("tag-1", 0, 510, { type: "add_tag", tag: "wholesale" }),
      n("pipeline-1", 0, 680, {
        type: "add_to_pipeline",
        pipelineId: wholesale?.id ?? pipelines.sales.id,
        stageId: wholesale?.stages["Enquiry"].id ?? pipelines.sales.stages["Lead"].id,
      }),
      n("message-2", 0, 850, {
        type: "send_message",
        message: { text: "Sent to {{email|your inbox}}. Bikash from our team will follow up within one working day." },
      }),
    ],
    edges: [e("trigger", "message-1"), e("message-1", "ask-email", "btn:0"), e("ask-email", "tag-1"), e("tag-1", "pipeline-1"), e("pipeline-1", "message-2")],
  };
}

function giveawayFlow(): FlowGraph {
  return {
    nodes: [
      TRIGGER,
      n("tag-1", 0, 170, { type: "add_tag", tag: "giveaway" }),
      n("message-1", 0, 340, {
        type: "send_message",
        message: { text: "You're in the Dashain giveaway, {{first_name|there}}. We'll announce the three winners on our story on October 15." },
      }),
    ],
    edges: [e("trigger", "tag-1"), e("tag-1", "message-1")],
  };
}

function assertValid(name: string, flow: FlowGraph) {
  const result = validateFlow(flow);
  if (!result.ok) throw new Error(`Seed flow "${name}" is invalid: ${result.errors.join("; ")}`);
  return flow as unknown as Prisma.InputJsonValue;
}

// ───────────────────────── Cleanup ─────────────────────────

const SEED_EMAIL = (process.env.SEED_EMAIL ?? "demo@awwtomation.local").toLowerCase();
const SEED_DOMAIN = ".local";

/** Removes organizations that only seed users belong to (every member email ends in .local); their workspaces go with them. */
async function cleanup() {
  const organizations = await prisma.organization.findMany({ select: { id: true, members: { select: { user: { select: { email: true } } } } } });
  const disposable = organizations.filter((o) => o.members.length > 0 && o.members.every((m) => m.user.email.endsWith(SEED_DOMAIN))).map((o) => o.id);
  if (disposable.length) await prisma.organization.deleteMany({ where: { id: { in: disposable } } });
  return disposable.length;
}

const MONTH_START = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));

async function createOrganization(o: {
  name: string;
  slug: string;
  plan: PlanTier;
  createdDaysAgo: number;
  owner: { id: string };
  team: Array<{ id: string; role: "ADMIN" | "MEMBER" }>;
}) {
  return prisma.organization.create({
    data: {
      name: o.name,
      slug: o.slug,
      plan: o.plan,
      usagePeriodStart: MONTH_START,
      createdAt: nptTime(o.createdDaysAgo, 10),
      members: {
        create: [
          { userId: o.owner.id, role: "OWNER", createdAt: nptTime(o.createdDaysAgo, 10) },
          ...o.team.map((t, i) => ({ userId: t.id, role: t.role, createdAt: nptTime(Math.max(0, o.createdDaysAgo - 5 - i * 9), 14) })),
        ],
      },
    },
  });
}

// ───────────────────────── Pipelines ─────────────────────────

type SeedStage = { id: string; name: string; position: number };
type SeedPipeline = { id: string; name: string; stages: Record<string, SeedStage> };
type SeedPipelines = { sales: SeedPipeline; wholesale?: SeedPipeline };

const WHOLESALE_STAGES: ReadonlyArray<{ name: string; color: StageColor }> = [
  { name: "Enquiry", color: "blue" },
  { name: "Price sheet sent", color: "violet" },
  { name: "Samples sent", color: "amber" },
  { name: "Ordering", color: "green" },
  { name: "Not a fit", color: "gray" },
];

async function createSeedPipeline(workspaceId: string, name: string, stages: ReadonlyArray<{ name: string; color: StageColor }>, position: number, createdAt: Date): Promise<SeedPipeline> {
  const pipeline = await prisma.pipeline.create({
    data: { workspaceId, name, position, createdAt, stages: { create: stages.map((s, i) => ({ name: s.name, color: s.color, position: i, createdAt })) } },
    include: { stages: true },
  });
  return { id: pipeline.id, name: pipeline.name, stages: Object.fromEntries(pipeline.stages.map((s) => [s.name, { id: s.id, name: s.name, position: s.position }])) };
}

async function upsertUser(email: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name },
    create: { authId: `seed:${email}`, email, name },
  });
}

// ───────────────────────── Workspace builder ─────────────────────────

type AutomationSpec = {
  name: string;
  channel: "ig" | "fb";
  status: "ACTIVE" | "PAUSED" | "DRAFT";
  triggerType: "COMMENT" | "DM" | "STORY_REPLY";
  matchMode: "CONTAINS" | "EXACT" | "ANY";
  keywords: string[];
  /** A function when the flow needs this workspace's pipeline ids. */
  flow: FlowGraph | ((pipelines: SeedPipelines) => FlowGraph);
  publicReplies: string[];
  mediaIndex?: number[];
  /** Share of all triggers this automation receives. */
  weight: number;
  link?: { slug: string; label: string; url: string; ctr: number };
  followGate?: boolean;
  createdDaysAgo: number;
};

type BuildOptions = {
  organizationId: string;
  slug: string;
  name: string;
  createdDaysAgo: number;
  handle: string;
  displayName: string;
  followers: number;
  fbPage?: { handle: string; name: string; followers: number };
  captions: string[];
  /** Illustrations in public/demo/posts, one per caption, so post pickers show real-looking thumbnails. */
  thumbnails: string[];
  automations: AutomationSpec[];
  contacts: number;
  days: number;
  /** Triggers per day at the start and end of the window (linear growth). */
  volume: [number, number];
  owner: { id: string };
  team: Array<{ id: string; role: "ADMIN" | "MEMBER" }>;
  tags: string[];
  conversations: number;
  /** Adds a second pipeline for wholesale buyers. */
  wholesalePipeline?: boolean;
};

/** The live DM counter a real organization would have: every DM its workspaces sent this UTC month, broadcasts included. */
async function meterThisMonth(organizationId: string) {
  const metered = await prisma.deliveryLog.count({
    where: {
      workspace: { organizationId },
      status: DeliveryStatus.SENT,
      kind: { in: [DeliveryKind.PRIVATE_REPLY, DeliveryKind.MESSAGE, DeliveryKind.BROADCAST] },
      createdAt: { gte: MONTH_START },
    },
  });
  await prisma.organization.update({ where: { id: organizationId }, data: { dmsSentThisPeriod: metered, usagePeriodStart: MONTH_START } });
}

async function buildWorkspace(o: BuildOptions) {
  const workspace = await prisma.workspace.create({
    data: {
      organizationId: o.organizationId,
      name: o.name,
      slug: o.slug,
      timezone: "Asia/Kathmandu",
      onboardedAt: nptTime(o.createdDaysAgo - 1, 11),
      createdAt: nptTime(o.createdDaysAgo, 10),
    },
  });
  const teamIds = [o.owner.id, ...o.team.map((t) => t.id)];

  const pipelines: SeedPipelines = {
    sales: await createSeedPipeline(workspace.id, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES, 0, nptTime(o.createdDaysAgo, 10)),
    wholesale: o.wholesalePipeline ? await createSeedPipeline(workspace.id, "Wholesale", WHOLESALE_STAGES, 1, nptTime(o.createdDaysAgo - 12, 15)) : undefined,
  };
  const sales = pipelines.sales;

  const ig = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      platform: ChannelPlatform.INSTAGRAM,
      externalId: `17841${int(100000000, 999999999)}${int(100, 999)}`,
      username: o.handle,
      name: o.displayName,
      accessTokenEnc: encrypt("seed-placeholder-token"),
      tokenExpiresAt: new Date(NOW.getTime() + 47 * 86_400_000),
      scopes: ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"],
      status: "ACTIVE",
      webhookSubscribed: true,
      followerCount: o.followers,
      lastSyncedAt: nptTime(0, 8),
      connectedById: o.owner.id,
      createdAt: nptTime(o.createdDaysAgo - 1, 11),
    },
  });
  const fb = o.fbPage
    ? await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          platform: ChannelPlatform.FACEBOOK,
          externalId: `10${int(1000000000000, 9999999999999)}`,
          username: o.fbPage.handle,
          name: o.fbPage.name,
          accessTokenEnc: encrypt("seed-placeholder-page-token"),
          scopes: ["pages_messaging", "pages_manage_engagement", "pages_read_engagement"],
          status: "ACTIVE",
          webhookSubscribed: true,
          followerCount: o.fbPage.followers,
          lastSyncedAt: nptTime(0, 8),
          connectedById: o.owner.id,
          createdAt: nptTime(o.createdDaysAgo - 20, 15),
        },
      })
    : null;

  const media = await Promise.all(
    o.captions.map((caption, i) =>
      prisma.media.create({
        data: {
          channelId: ig.id,
          externalId: `18${int(100000000000000, 999999999999999)}`,
          caption,
          thumbnailUrl: o.thumbnails[i] ?? null,
          mediaType: i % 3 === 0 ? "VIDEO" : i % 3 === 1 ? "CAROUSEL_ALBUM" : "IMAGE",
          permalink: `https://www.instagram.com/p/${cid().slice(0, 11)}/`,
          timestamp: nptTime(Math.max(1, o.days - 5 - i * Math.floor(o.days / Math.max(o.captions.length, 1))), 19),
          commentCount: int(30, 1400),
          likeCount: int(400, 18000),
        },
      }),
    ),
  );

  // Automations + their tracked links
  const automations = [];
  for (const spec of o.automations) {
    const channel = spec.channel === "fb" && fb ? fb : ig;
    const flow = typeof spec.flow === "function" ? spec.flow(pipelines) : spec.flow;
    const automation = await prisma.automation.create({
      data: {
        workspaceId: workspace.id,
        channelId: channel.id,
        name: spec.name,
        status: spec.status,
        triggerType: spec.triggerType,
        matchMode: spec.matchMode,
        keywords: spec.keywords,
        mediaIds: (spec.mediaIndex ?? []).map((i) => media[i]?.externalId).filter((x): x is string => Boolean(x)),
        flow: assertValid(spec.name, flow),
        publicReplyEnabled: spec.publicReplies.length > 0,
        publicReplies: spec.publicReplies,
        oncePerContact: true,
        createdAt: nptTime(spec.createdDaysAgo, 12),
      },
    });
    const link = spec.link
      ? await prisma.trackedLink.create({
          data: { workspaceId: workspace.id, automationId: automation.id, slug: spec.link.slug, label: spec.link.label, destinationUrl: spec.link.url, createdAt: nptTime(spec.createdDaysAgo, 12) },
        })
      : null;
    automations.push({ spec, automation, channel, link, flow });
  }

  // Contacts, spread so newer days have more new people
  const contactRows: Prisma.ContactCreateManyInput[] = [];
  const contactMeta: Array<{ id: string; firstSeen: Date; username: string; name: string; channelId: string; platform: ChannelPlatform; isFollower: boolean }> = [];
  const usedHandles = new Set<string>();
  for (let i = 0; i < o.contacts; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    let username = `${first}.${last}`.toLowerCase();
    while (usedHandles.has(username)) username = `${first.toLowerCase()}${pick(["_", ".", ""])}${last.toLowerCase()}${int(2, 99)}`;
    usedHandles.add(username);
    const onFb = fb !== null && chance(0.12);
    const channel = onFb && fb ? fb : ig;
    // Square-root skew: more first-seen dates near today, matching the growth curve.
    const daysAgo = Math.floor((1 - Math.sqrt(rand())) * (o.days - 2));
    const firstSeen = nptTime(daysAgo, weighted(HOUR_WEIGHTS));
    const id = cid();
    const isFollower = chance(0.68);
    contactRows.push({
      id,
      workspaceId: workspace.id,
      channelId: channel.id,
      platform: channel.platform,
      externalId: `${channel.platform === "INSTAGRAM" ? "ig" : "fb"}_${int(1000000000, 9999999999)}`,
      username: channel.platform === "INSTAGRAM" ? username : null,
      name: `${first} ${last}`,
      isFollower,
      firstSeenAt: firstSeen,
      createdAt: firstSeen,
      source: "WEBHOOK",
      customFields: chance(0.45) ? { city: pick(CITIES) } : {},
    });
    contactMeta.push({ id, firstSeen, username, name: `${first} ${last}`, channelId: channel.id, platform: channel.platform, isFollower });
  }
  // A handful added by hand or from a spreadsheet — they can't be messaged until they interact.
  const manualCount = Math.round(o.contacts * 0.04);
  const manual: Array<{ id: string; at: Date; stage: "Lead" | "Customer" }> = [];
  for (let i = 0; i < manualCount; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const daysAgo = int(3, Math.max(4, o.days - 10));
    const id = cid();
    manual.push({ id, at: nptTime(daysAgo, 11), stage: pick(["Lead", "Customer"] as const) });
    contactRows.push({
      id,
      workspaceId: workspace.id,
      channelId: ig.id,
      platform: ChannelPlatform.INSTAGRAM,
      externalId: `manual:${cid()}`,
      name: `${first} ${last}`,
      email: `${first}.${last}@gmail.com`.toLowerCase(),
      phone: `+97798${int(10000000, 99999999)}`,
      source: i % 2 === 0 ? "MANUAL" : "IMPORT",
      messageable: false,
      ownerId: pick(teamIds),
      tags: ["wholesale"],
      customFields: { city: pick(CITIES) },
      firstSeenAt: nptTime(daysAgo, 11),
      createdAt: nptTime(daysAgo, 11),
    });
  }
  await prisma.contact.createMany({ data: contactRows });
  contactMeta.sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime());

  // Triggers → sessions, private replies, public replies, clicks
  const logs: Prisma.DeliveryLogCreateManyInput[] = [];
  const sessions: Prisma.FlowSessionCreateManyInput[] = [];
  const clicks: Prisma.LinkClickCreateManyInput[] = [];
  const lastTouch = new Map<string, Date>();
  const tagsFor = new Map<string, Set<string>>();
  const seenPerAutomation = new Map<string, Set<string>>();
  const activeSpecs = automations.filter((a) => a.spec.status !== "DRAFT");

  for (let d = o.days - 1; d >= 0; d--) {
    const progress = (o.days - 1 - d) / Math.max(o.days - 1, 1);
    const base = o.volume[0] + (o.volume[1] - o.volume[0]) * progress;
    // A new-collection drop three days ago, so this week reads a little busier than last.
    const spike = d >= 2 && d <= 5 ? 1.6 - Math.abs(d - 3) * 0.2 : 1;
    const volume = Math.max(0, Math.round(base * DOW_FACTOR[localDow(d)] * spike * (0.78 + rand() * 0.44)));
    const pool = contactMeta.filter((c) => c.firstSeen <= nptTime(d, 23, 59));
    if (pool.length === 0) continue;

    for (let k = 0; k < volume; k++) {
      const eligible = activeSpecs.filter((a) => a.spec.createdDaysAgo >= d && (a.spec.status === "ACTIVE" || d > 20));
      if (eligible.length === 0) break;
      const target = weighted(eligible.map((a) => [a, a.spec.weight] as const));
      // Recent contacts comment more often. Most people comment on a given
      // automation once; only ~1 in 9 triggers comes from someone it already replied to.
      const seen = seenPerAutomation.get(target.automation.id) ?? new Set<string>();
      seenPerAutomation.set(target.automation.id, seen);
      const allowRepeat = chance(0.11);
      let contact = pool[Math.floor(pool.length * (1 - Math.pow(rand(), 1.8)))] ?? pool[pool.length - 1];
      for (let attempt = 0; attempt < 12 && !allowRepeat && seen.has(contact.id); attempt++) {
        contact = pool[Math.floor(rand() * pool.length)];
      }
      const at = nptTime(d, weighted(HOUR_WEIGHTS));
      const repeat = seen.has(contact.id);
      seen.add(contact.id);

      const status: DeliveryStatus = repeat
        ? DeliveryStatus.SKIPPED_DUPLICATE
        : weighted<DeliveryStatus>([
            [DeliveryStatus.SENT, 93],
            [DeliveryStatus.SKIPPED_NOT_FOLLOWING, target.spec.followGate ? 9 : 0],
            [DeliveryStatus.SKIPPED_SELF, 0.8],
            [DeliveryStatus.SKIPPED_WINDOW, target.spec.triggerType === "COMMENT" ? 0 : 1.5],
            [DeliveryStatus.SKIPPED_RATE_LIMIT, 0.4],
            [DeliveryStatus.SKIPPED_OPTED_OUT, 0.4],
            [DeliveryStatus.FAILED, 1.4],
          ]);
      const commentId = `${int(17800000000000000, 17999999999999999)}`;
      // Real sends store the message as the person received it, variables filled in.
      const template = (target.flow.nodes.find((x) => x.data.type === "send_message")?.data as { message?: { text?: string } } | undefined)?.message?.text;
      const preview = template
        ? renderTemplate(template, { username: `@${contact.username}`, name: contact.name, first_name: contact.name.split(/\s+/)[0] })
        : null;

      sessions.push({
        workspaceId: workspace.id,
        automationId: target.automation.id,
        contactId: contact.id,
        status: status === DeliveryStatus.SENT ? "COMPLETED" : "EXPIRED",
        context: { commentId },
        createdAt: at,
        updatedAt: at,
      });
      logs.push({
        workspaceId: workspace.id,
        channelId: target.channel.id,
        automationId: target.automation.id,
        contactId: contact.id,
        kind: target.spec.triggerType === "COMMENT" ? DeliveryKind.PRIVATE_REPLY : DeliveryKind.MESSAGE,
        status,
        commentExternalId: target.spec.triggerType === "COMMENT" ? commentId : null,
        recipientExternalId: contact.id,
        recipientUsername: contact.username,
        messagePreview: preview,
        errorMessage:
          status === DeliveryStatus.FAILED
            ? pick(["(#10) This message is sent outside of allowed window.", "(#551) This person isn't available right now.", "Error validating access token: Session has expired"])
            : status === DeliveryStatus.SKIPPED_DUPLICATE
              ? "Already sent to this contact (once per contact)"
              : null,
        createdAt: at,
      });
      if (status === DeliveryStatus.SENT) {
        const prev = lastTouch.get(contact.id);
        if (!prev || prev < at) lastTouch.set(contact.id, at);
        const tags = tagsFor.get(contact.id) ?? new Set<string>();
        if (target.spec.name.toLowerCase().includes("giveaway")) tags.add("giveaway");
        if (target.spec.keywords.some((kw) => kw === "size")) tags.add("size-guide");
        if (target.spec.triggerType === "DM") tags.add("wholesale");
        tagsFor.set(contact.id, tags);

        if (target.spec.publicReplies.length && chance(0.9)) {
          logs.push({
            workspaceId: workspace.id,
            channelId: target.channel.id,
            automationId: target.automation.id,
            contactId: contact.id,
            kind: DeliveryKind.PUBLIC_REPLY,
            status: DeliveryStatus.SENT,
            commentExternalId: commentId,
            recipientUsername: contact.username,
            messagePreview: pick(target.spec.publicReplies),
            createdAt: minutesAfter(at, 0.2),
          });
        }
        if (target.link && chance(target.spec.link?.ctr ?? 0)) {
          clicks.push({ linkId: target.link.id, contactId: contact.id, userAgent: "Instagram 312.0 (iPhone; iOS 18)", createdAt: minutesAfter(at, int(1, 240)) });
        }
      }
    }
  }
  for (let i = 0; i < logs.length; i += 1000) await prisma.deliveryLog.createMany({ data: logs.slice(i, i + 1000) });
  for (let i = 0; i < sessions.length; i += 1000) await prisma.flowSession.createMany({ data: sessions.slice(i, i + 1000) });
  for (let i = 0; i < clicks.length; i += 1000) await prisma.linkClick.createMany({ data: clicks.slice(i, i + 1000) });

  for (const { automation, spec } of automations) {
    const own = logs.filter((l) => l.automationId === automation.id && l.kind !== DeliveryKind.PUBLIC_REPLY);
    const last = own.reduce<Date | null>((max, l) => (!max || (l.createdAt as Date) > max ? (l.createdAt as Date) : max), null);
    await prisma.automation.update({
      where: { id: automation.id },
      data: {
        triggeredCount: own.length,
        sentCount: own.filter((l) => l.status === DeliveryStatus.SENT).length,
        lastTriggeredAt: spec.status === "DRAFT" ? null : last,
      },
    });
  }
  const links = automations.map((a) => a.link).filter((l): l is NonNullable<typeof l> => l !== null);
  for (const link of links) {
    await prisma.trackedLink.update({ where: { id: link.id }, data: { clickCount: clicks.filter((c) => c.linkId === link.id).length } });
  }

  // CRM: pipeline places, owners, emails, tags, stage history. Contacts who never interacted stay out of the pipeline.
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const entries: Prisma.PipelineEntryCreateManyInput[] = [];
  const stageFor = new Map<string, string>();
  const stageAudit = (pipeline: SeedPipeline, contactId: string, from: string | null, to: string, createdAt: Date, userId: string | null): Prisma.AuditLogCreateManyInput => ({
    workspaceId: workspace.id,
    userId,
    action: "contact.stage_changed",
    targetType: "contact",
    targetId: contactId,
    metadata: { pipelineId: pipeline.id, pipeline: pipeline.name, from, to, toPosition: pipeline.stages[to].position },
    createdAt,
  });
  for (const c of contactMeta) {
    const touched = lastTouch.get(c.id);
    const stage = !touched
      ? "New"
      : weighted([
          ["New", 34],
          ["Engaged", 30],
          ["Lead", 19],
          ["Customer", 12],
          ["Lost", 5],
        ] as const);
    stageFor.set(c.id, stage);
    const path = stage === "Engaged" ? ["Engaged"] : stage === "Lead" ? ["Engaged", "Lead"] : stage === "Customer" ? ["Engaged", "Lead", "Customer"] : stage === "Lost" ? ["Engaged", "Lost"] : [];
    let from = "New";
    let when = touched ?? c.firstSeen;
    if (touched) {
      audits.push(stageAudit(sales, c.id, null, "New", touched, null));
      for (const to of path) {
        when = minutesAfter(when, int(40, 60 * 24 * 6));
        audits.push(stageAudit(sales, c.id, from, to, when, pick(teamIds)));
        from = to;
      }
      entries.push({ workspaceId: workspace.id, pipelineId: sales.id, stageId: sales.stages[stage].id, contactId: c.id, createdAt: touched, updatedAt: when });
    }
    const tags = [...(tagsFor.get(c.id) ?? [])];
    if (stage === "Customer" && chance(0.4)) tags.push("repeat-buyer");
    if (stage === "Customer" && chance(0.2)) tags.push("vip");
    const email = stage === "Lead" || stage === "Customer" ? (chance(0.8) ? `${c.name.split(" ")[0]}.${c.name.split(" ")[1]}${pick(["", "", String(int(1, 99))])}@gmail.com`.toLowerCase() : null) : chance(0.08) ? `${c.username.replace(/\./g, "")}@gmail.com` : null;
    await prisma.contact.update({
      where: { id: c.id },
      data: {
        ownerId: stage === "Lead" || stage === "Customer" ? pick(teamIds) : null,
        email,
        phone: stage === "Customer" && chance(0.6) ? `+97798${int(10000000, 99999999)}` : null,
        tags: [...new Set(tags)],
        lastInteractionAt: touched ?? null,
        optedOut: chance(0.015),
        customFields:
          stage === "Customer"
            ? { city: pick(CITIES), size: pick(["S", "M", "L", "XL"]) }
            : stage === "Lead"
              ? { city: pick(CITIES) }
              : undefined,
      },
    });
  }
  // Manual and imported contacts: straight into the sales pipeline, and wholesale buyers into the wholesale one.
  for (const m of manual) {
    const by = pick(teamIds);
    audits.push(stageAudit(sales, m.id, null, m.stage, m.at, by));
    entries.push({ workspaceId: workspace.id, pipelineId: sales.id, stageId: sales.stages[m.stage].id, contactId: m.id, createdAt: m.at, updatedAt: m.at });
  }
  const wholesale = pipelines.wholesale;
  if (wholesale) {
    const buyers = [...manual.map((m) => ({ id: m.id, at: m.at })), ...contactMeta.filter((c) => (tagsFor.get(c.id) ?? new Set()).has("wholesale")).map((c) => ({ id: c.id, at: lastTouch.get(c.id) ?? c.firstSeen }))];
    for (const b of buyers) {
      const stage = weighted([
        ["Enquiry", 30],
        ["Price sheet sent", 26],
        ["Samples sent", 14],
        ["Ordering", 12],
        ["Not a fit", 8],
      ] as const);
      const at = minutesAfter(b.at, int(30, 60 * 24 * 4));
      audits.push(stageAudit(wholesale, b.id, null, stage, at, pick(teamIds)));
      entries.push({ workspaceId: workspace.id, pipelineId: wholesale.id, stageId: wholesale.stages[stage].id, contactId: b.id, createdAt: at, updatedAt: at });
    }
  }
  for (let i = 0; i < entries.length; i += 1000) await prisma.pipelineEntry.createMany({ data: entries.slice(i, i + 1000), skipDuplicates: true });
  for (let i = 0; i < audits.length; i += 1000) await prisma.auditLog.createMany({ data: audits.slice(i, i + 1000) });

  // Notes from the team on leads and customers
  const NOTES = [
    "Asked about bulk pricing for 40 pieces for her boutique in Pokhara. Sent the wholesale sheet.",
    "Wants the maroon kurta in M. Restock expected on the 20th, promised to message then.",
    "Paid via eSewa. Delivery to Lalitpur on Thursday.",
    "Returning customer, third order this year. Offer free delivery next time.",
    "Interested in custom embroidery for a wedding, 12 sets. Call back after Dashain.",
    "Size L was too tight. Exchanged for XL, no charge.",
    "Runs an online store in Biratnagar. Wants consignment terms, not wholesale.",
    "Asked whether the shawls are pure pashmina. Sent the fabric details.",
    "Ordered two gift boxes for Tihar. Needs them before Oct 28.",
    "Did not reply after the price sheet. Try once more next week.",
  ];
  const notable = contactMeta.filter((c) => ["Lead", "Customer"].includes(stageFor.get(c.id) ?? "")).slice(-45);
  const noteRows: Prisma.ContactNoteCreateManyInput[] = [];
  const noteCounts = new Map<string, number>();
  for (const c of notable) {
    const count = weighted([[0, 3], [1, 5], [2, 2]] as const);
    for (let i = 0; i < count; i++) {
      const at = minutesAfter(lastTouch.get(c.id) ?? c.firstSeen, int(30, 60 * 24 * 3));
      noteRows.push({ workspaceId: workspace.id, contactId: c.id, authorId: pick(teamIds), body: pick(NOTES), createdAt: at, updatedAt: at });
      noteCounts.set(c.id, (noteCounts.get(c.id) ?? 0) + 1);
    }
  }
  if (noteRows.length) await prisma.contactNote.createMany({ data: noteRows });
  for (const [id, notesCount] of noteCounts) await prisma.contact.update({ where: { id }, data: { notesCount } });

  // Inbox: the most recent people, with automated replies and the team answering by hand
  const INBOUND = [
    "Is this available in size M?",
    "How much is delivery to Pokhara?",
    "Do you have this in maroon?",
    "Can I pay with eSewa?",
    "Thank you! Just ordered 🙏",
    "Is the shawl pure pashmina?",
    "When will the green one be back in stock?",
    "Do you ship to Dharan?",
    "Can I exchange if it doesn't fit?",
    "Wholesale price for 25 pieces?",
  ];
  const REPLIES = [
    "Yes, M is in stock. Want me to hold one for you?",
    "Delivery to Pokhara is Rs. 150 and takes 2–3 days.",
    "We have maroon in S and L right now, M arrives on the 20th.",
    "Yes, eSewa and Khalti both work. I'll send the details.",
    "Thank you for the order! It ships tomorrow morning.",
    "It's a pashmina and silk blend, 70/30. Very warm, and softer than pure wool.",
    "Next week. I'll message you as soon as it lands.",
    "Yes, we deliver across Nepal. Dharan is 3–4 days.",
    "Yes, within 7 days as long as the tags are on.",
    "I've sent the wholesale sheet to your email. Minimum order is 20 pieces.",
  ];
  const recent = [...lastTouch.entries()].sort((a, b) => b[1].getTime() - a[1].getTime()).slice(0, o.conversations);
  for (const [index, [contactId, touched]] of recent.entries()) {
    const c = contactMeta.find((x) => x.id === contactId);
    if (!c) continue;
    const which = int(0, INBOUND.length - 1);
    const autoAt = touched;
    const inboundAt = minutesAfter(autoAt, int(2, 40));
    const answered = index > 3 && chance(0.78);
    const replyAt = minutesAfter(inboundAt, weighted([[int(2, 12), 5], [int(13, 45), 4], [int(46, 240), 2], [int(241, 900), 1]] as const));
    const staff = pick(teamIds);
    const messages: Prisma.MessageCreateManyConversationInput[] = [
      { direction: MessageDirection.OUTBOUND, externalId: `m_${cid()}`, text: "Thanks for your comment! Here's the link you asked for.", automationId: automations[0]?.automation.id, createdAt: autoAt },
      { direction: MessageDirection.INBOUND, externalId: `m_${cid()}`, text: INBOUND[which], createdAt: inboundAt },
    ];
    if (answered) messages.push({ direction: MessageDirection.OUTBOUND, externalId: `m_${cid()}`, text: REPLIES[which], sentByUserId: staff, createdAt: replyAt });
    const lastAt = answered ? replyAt : inboundAt;
    await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        channelId: c.channelId,
        contactId,
        status: index > o.conversations - 6 ? "CLOSED" : "OPEN",
        lastInboundAt: inboundAt,
        lastMessageAt: lastAt,
        lastMessagePreview: answered ? REPLIES[which] : INBOUND[which],
        unreadCount: answered ? 0 : 1,
        assignedToId: index % 3 === 0 ? staff : null,
        createdAt: autoAt,
        messages: { createMany: { data: messages } },
      },
    });
    if (answered) await prisma.contact.update({ where: { id: contactId }, data: { lastContactedAt: replyAt } });
  }

  await meterThisMonth(o.organizationId);

  return { workspace, ig, fb, automations, contactMeta, stageFor, teamIds, pipelines, logsCount: logs.length, clicksCount: clicks.length, links };
}

// ───────────────────────── Main ─────────────────────────

async function main() {
  const removed = await cleanup();

  const sara = await upsertUser(SEED_EMAIL, "Sara Maharjan");
  const bikash = await upsertUser("bikash@himalayanthreads.local", "Bikash Thapa");
  const anisha = await upsertUser("anisha@himalayanthreads.local", "Anisha Gurung");

  // ── Himalayan Threads ──
  const htOrg = await createOrganization({
    name: "Himalayan Threads",
    slug: "himalayan-threads",
    plan: "PRO",
    createdDaysAgo: 160,
    owner: sara,
    team: [
      { id: bikash.id, role: "ADMIN" },
      { id: anisha.id, role: "MEMBER" },
    ],
  });
  const ht = await buildWorkspace({
    organizationId: htOrg.id,
    slug: "himalayan-threads",
    name: "Himalayan Threads",
    createdDaysAgo: 160,
    handle: "himalayanthreads",
    displayName: "Himalayan Threads",
    followers: 48_200,
    fbPage: { handle: "himalayanthreads", name: "Himalayan Threads", followers: 9_830 },
    captions: [
      "Autumn collection is here. Comment LINK and we'll DM you the lookbook.",
      "Hand-embroidered in Bhaktapur. Every piece takes four days. Comment SIZE for the size guide.",
      "Dashain giveaway: comment on this post to enter. Three winners, announced Oct 15.",
      "The maroon kurta is back in M and L.",
      "Behind the scenes at our Lalitpur workshop.",
      "Pashmina and silk wraps for Tihar gifting. Comment LINK to shop.",
      "How we dye our cotton with natural indigo.",
      "Wholesale enquiries: DM us the word WHOLESALE.",
    ],
    thumbnails: ["autumn", "embroidery", "dashain", "maroon", "workshop", "pashmina", "indigo", "wholesale"].map((n) => `/demo/posts/ht-${n}.svg`),
    automations: [
      {
        name: "Autumn collection link",
        channel: "ig",
        status: "ACTIVE",
        triggerType: "COMMENT",
        matchMode: "CONTAINS",
        keywords: ["link", "shop"],
        flow: linkFlow("Namaste {{first_name|there}}! Here's the autumn collection. Delivery is free inside the valley this month.", "Shop the collection", "https://himalayanthreads.com/collections/autumn"),
        publicReplies: ["Sent you a DM", "Check your inbox", "Just sent it over"],
        mediaIndex: [0, 5],
        weight: 46,
        link: { slug: "autumn26", label: "Autumn collection", url: "https://himalayanthreads.com/collections/autumn", ctr: 0.34 },
        createdDaysAgo: 150,
      },
      {
        name: "Size guide for followers",
        channel: "ig",
        status: "ACTIVE",
        triggerType: "COMMENT",
        matchMode: "EXACT",
        keywords: ["size"],
        flow: followGateFlow("himalayanthreads", "https://himalayanthreads.com/pages/size-guide"),
        publicReplies: ["Sent you the size guide"],
        mediaIndex: [1],
        weight: 22,
        followGate: true,
        link: { slug: "sizes", label: "Size guide", url: "https://himalayanthreads.com/pages/size-guide", ctr: 0.41 },
        createdDaysAgo: 118,
      },
      {
        name: "Wholesale price sheet",
        channel: "ig",
        status: "ACTIVE",
        triggerType: "DM",
        matchMode: "CONTAINS",
        keywords: ["wholesale", "bulk"],
        flow: wholesaleFlow,
        publicReplies: [],
        weight: 7,
        createdDaysAgo: 96,
      },
      {
        name: "Price list from stories",
        channel: "ig",
        status: "ACTIVE",
        triggerType: "STORY_REPLY",
        matchMode: "CONTAINS",
        keywords: ["price", "rate"],
        flow: linkFlow("Here's our full price list. Reply here if you have a question about a piece.", "Price list", "https://himalayanthreads.com/pages/prices"),
        publicReplies: [],
        weight: 12,
        link: { slug: "prices", label: "Price list", url: "https://himalayanthreads.com/pages/prices", ctr: 0.29 },
        createdDaysAgo: 70,
      },
      {
        name: "Dashain giveaway",
        channel: "ig",
        status: "PAUSED",
        triggerType: "COMMENT",
        matchMode: "ANY",
        keywords: [],
        flow: giveawayFlow(),
        publicReplies: ["You're in. Good luck!"],
        mediaIndex: [2],
        weight: 9,
        createdDaysAgo: 40,
      },
      {
        name: "Page comments to shop",
        channel: "fb",
        status: "ACTIVE",
        triggerType: "COMMENT",
        matchMode: "CONTAINS",
        keywords: ["link", "price"],
        flow: linkFlow("Thanks for your comment! Here's the collection on our website.", "Visit the shop", "https://himalayanthreads.com"),
        publicReplies: ["Sent you a message"],
        weight: 4,
        createdDaysAgo: 60,
      },
      {
        name: "Restock alert: maroon kurta",
        channel: "ig",
        status: "DRAFT",
        triggerType: "COMMENT",
        matchMode: "CONTAINS",
        keywords: ["restock", "notify"],
        flow: linkFlow("It's back! The maroon kurta is in stock in every size again.", "Buy now", "https://himalayanthreads.com/products/maroon-kurta"),
        publicReplies: [],
        weight: 0,
        createdDaysAgo: 2,
      },
    ],
    contacts: 1850,
    days: 150,
    volume: [6, 42],
    owner: sara,
    team: [
      { id: bikash.id, role: "ADMIN" },
      { id: anisha.id, role: "MEMBER" },
    ],
    tags: [],
    conversations: 48,
    wholesalePipeline: true,
  });

  // Broadcasts
  // Only people who existed when it went out, so no contact shows a broadcast from before they first appeared.
  const broadcastAt = nptTime(16, 18, 30);
  const reachable = ht.contactMeta
    .filter((c) => c.channelId === ht.ig.id && c.isFollower && ht.stageFor.get(c.id) !== "New" && c.firstSeen < broadcastAt)
    .slice(-164);
  const sentBroadcast = await prisma.broadcast.create({
    data: {
      workspaceId: ht.workspace.id,
      channelId: ht.ig.id,
      name: "Dashain preview for followers",
      message: { text: "Our Dashain collection goes live on Friday. You're getting a first look today, with 10% off until Sunday.", buttons: [{ type: "web_url", title: "See the collection", url: "https://himalayanthreads.com/collections/dashain" }] },
      audience: { tags: [], excludeTags: [], onlyFollowers: true, onlyInWindow: true },
      status: "SENT",
      startedAt: broadcastAt,
      completedAt: nptTime(16, 18, 42),
      targetCount: reachable.length,
      sentCount: reachable.length - 13,
      failedCount: 0,
      skippedCount: 13,
      createdAt: nptTime(17, 16),
    },
  });
  await prisma.deliveryLog.createMany({
    data: reachable.map((c, i) => ({
      workspaceId: ht.workspace.id,
      channelId: ht.ig.id,
      broadcastId: sentBroadcast.id,
      contactId: c.id,
      kind: DeliveryKind.BROADCAST,
      status: i < 13 ? DeliveryStatus.SKIPPED_WINDOW : DeliveryStatus.SENT,
      recipientUsername: c.username,
      messagePreview: "Our Dashain collection goes live on Friday. You're getting a first look today, with 10% off until Sunday.",
      createdAt: nptTime(16, 18, 30 + Math.floor(i / 20)),
    })),
  });
  await prisma.broadcast.create({
    data: {
      workspaceId: ht.workspace.id,
      channelId: ht.ig.id,
      name: "Maroon kurta is back",
      message: { text: "The maroon kurta you asked about is back in every size.", buttons: [{ type: "web_url", title: "Order now", url: "https://himalayanthreads.com/products/maroon-kurta" }] },
      audience: { tags: ["size-guide"], excludeTags: [], onlyFollowers: false, onlyInWindow: true },
      status: "SCHEDULED",
      scheduledAt: new Date(NOW.getTime() + 2 * 86_400_000),
      createdAt: nptTime(1, 15),
    },
  });
  await prisma.broadcast.create({
    data: {
      workspaceId: ht.workspace.id,
      channelId: ht.ig.id,
      name: "Winter collection early access",
      message: { text: "Winter pieces arrive next month. Want first pick?" },
      audience: { tags: [], excludeTags: [], onlyFollowers: true, onlyInWindow: true },
      status: "DRAFT",
      createdAt: nptTime(0, 10),
    },
  });

  // A tracked link shared by hand, outside any automation
  await prisma.trackedLink.create({
    data: { workspaceId: ht.workspace.id, slug: "bio", label: "Link in bio", destinationUrl: "https://himalayanthreads.com", clickCount: 312, createdAt: nptTime(140, 10) },
  });

  // Saved segments
  await prisma.segment.createMany({
    data: [
      {
        workspaceId: ht.workspace.id,
        name: "Hot leads",
        description: "Leads who talked to us in the last 30 days",
        filters: { pipelineId: ht.pipelines.sales.id, stageId: ht.pipelines.sales.stages["Lead"].id, lastInteractionDays: 30 },
      },
      { workspaceId: ht.workspace.id, name: "Wholesale enquiries", description: null, filters: { tags: ["wholesale"] } },
      {
        workspaceId: ht.workspace.id,
        name: "Customers",
        description: "Everyone who has bought",
        filters: { pipelineId: ht.pipelines.sales.id, stageId: ht.pipelines.sales.stages["Customer"].id },
      },
      { workspaceId: ht.workspace.id, name: "Giveaway entrants", description: null, filters: { tags: ["giveaway"] } },
    ],
  });

  // Pending invitation
  await prisma.invitation.create({
    data: { organizationId: htOrg.id, email: "rohan@himalayanthreads.com", role: "MEMBER", token: cid() + cid(), invitedById: sara.id, expiresAt: new Date(NOW.getTime() + 5 * 86_400_000), createdAt: nptTime(2, 12) },
  });

  // A second brand in the same organization, not set up yet
  const htKids = await prisma.workspace.create({
    data: { organizationId: htOrg.id, name: "Himalayan Threads Kids", slug: "himalayan-threads-kids", timezone: "Asia/Kathmandu", createdAt: nptTime(6, 13) },
  });
  await createSeedPipeline(htKids.id, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES, 0, nptTime(6, 13));

  // Billing: an active monthly Pro subscription with a payment history
  const periodEnd = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, 4, 6));
  await prisma.organization.update({
    where: { id: htOrg.id },
    data: {
      planSource: "SUBSCRIPTION",
      billingStatus: "ACTIVE",
      billingInterval: "MONTHLY",
      subscribedPlan: "PRO",
      billingCustomerId: `cus_${cid().slice(1, 15)}`,
      billingSubscriptionId: `sub_${cid().slice(1, 15)}`,
      billingEmail: "accounts@himalayanthreads.com",
      currentPeriodEnd: periodEnd,
    },
  });
  await prisma.payment.createMany({
    data: Array.from({ length: 5 }, (_, i) => {
      const paid = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - i, 4, 6));
      return {
        organizationId: htOrg.id,
        externalId: `pay_${cid().slice(1, 20)}`,
        amountCents: 4900,
        currency: "USD",
        status: "SUCCEEDED" as const,
        description: "Pro plan · Monthly",
        paidAt: paid,
        createdAt: paid,
      };
    }).filter((p) => p.paidAt <= NOW),
  });

  // ── Everest Coffee Roasters ──
  const ecOrg = await createOrganization({ name: "Everest Coffee Roasters", slug: "everest-coffee-roasters", plan: "STARTER", createdDaysAgo: 70, owner: sara, team: [] });
  const ec = await buildWorkspace({
    organizationId: ecOrg.id,
    slug: "everest-coffee-roasters",
    name: "Everest Coffee Roasters",
    createdDaysAgo: 70,
    handle: "everestcoffee.np",
    displayName: "Everest Coffee Roasters",
    followers: 7_450,
    captions: [
      "Single origin from Gulmi, roasted this morning. Comment MENU for our full menu.",
      "Our monthly bean subscription is almost full. Comment BEANS to join the waitlist.",
      "New in Jhamsikhel: cold brew on tap.",
    ],
    thumbnails: ["single-origin", "beans", "cold-brew"].map((n) => `/demo/posts/ec-${n}.svg`),
    automations: [
      {
        name: "Menu link",
        channel: "ig",
        status: "ACTIVE",
        triggerType: "COMMENT",
        matchMode: "CONTAINS",
        keywords: ["menu"],
        flow: linkFlow("Here's our menu, with this week's single origins.", "See the menu", "https://everestcoffee.com.np/menu"),
        publicReplies: ["Menu's in your DMs"],
        mediaIndex: [0],
        weight: 70,
        link: { slug: "menu", label: "Menu", url: "https://everestcoffee.com.np/menu", ctr: 0.38 },
        createdDaysAgo: 65,
      },
      {
        name: "Bean subscription waitlist",
        channel: "ig",
        status: "ACTIVE",
        triggerType: "COMMENT",
        matchMode: "CONTAINS",
        keywords: ["beans"],
        flow: linkFlow("You're on the list. We'll message you when a spot opens up.", "How it works", "https://everestcoffee.com.np/subscription"),
        publicReplies: ["Added you to the waitlist"],
        mediaIndex: [1],
        weight: 30,
        createdDaysAgo: 30,
      },
    ],
    contacts: 240,
    days: 60,
    volume: [2, 9],
    owner: sara,
    team: [],
    tags: [],
    conversations: 8,
  });
  await prisma.organization.update({
    where: { id: ecOrg.id },
    data: { planSource: "SUBSCRIPTION", billingStatus: "ACTIVE", billingInterval: "MONTHLY", subscribedPlan: "STARTER", currentPeriodEnd: periodEnd },
  });

  // ── Kathmandu Fitness Club: just created, nothing connected ──
  const kfcOrg = await createOrganization({ name: "Kathmandu Fitness Club", slug: "kathmandu-fitness-club", plan: "FREE", createdDaysAgo: 1, owner: bikash, team: [{ id: sara.id, role: "ADMIN" }] });
  const kfc = await prisma.workspace.create({
    data: { organizationId: kfcOrg.id, name: "Kathmandu Fitness Club", slug: "kathmandu-fitness-club", timezone: "Asia/Kathmandu", createdAt: nptTime(1, 16) },
  });
  await createSeedPipeline(kfc.id, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES, 0, nptTime(1, 16));

  console.log(
    `Seeded ${[htOrg, ecOrg, kfcOrg].map((w) => w.name).join(", ")} for ${SEED_EMAIL}` +
      ` (removed ${removed} old demo organization${removed === 1 ? "" : "s"}).\n` +
      `Himalayan Threads: ${ht.contactMeta.length} contacts, ${ht.logsCount} deliveries, ${ht.clicksCount} clicks.`,
  );
  // ── Annapurna Trekking Co.: someone else's workspace with a pending invitation for the demo user ──
  const atcOrg = await createOrganization({ name: "Annapurna Trekking Co.", slug: "annapurna-trekking-co", plan: "STARTER", createdDaysAgo: 20, owner: bikash, team: [] });
  const atc = await prisma.workspace.create({
    data: { organizationId: atcOrg.id, name: "Annapurna Trekking Co.", slug: "annapurna-trekking-co", timezone: "Asia/Kathmandu", createdAt: nptTime(20, 9) },
  });
  await createSeedPipeline(atc.id, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES, 0, nptTime(20, 9));
  await prisma.invitation.create({
    data: {
      organizationId: atcOrg.id,
      email: SEED_EMAIL,
      role: "ADMIN",
      token: DEMO_INVITE_TOKEN,
      invitedById: bikash.id,
      expiresAt: new Date(NOW.getTime() + 6 * 86_400_000),
      createdAt: nptTime(0, 9),
    },
  });

  // Broadcast deliveries are written after the workspaces are built, so meter again once everything exists.
  await meterThisMonth(htOrg.id);
  await meterThisMonth(ecOrg.id);
  console.log(
    `SEED_WORKSPACES=${JSON.stringify({ "himalayan-threads": ht.workspace.id, "himalayan-threads-kids": htKids.id, "everest-coffee-roasters": ec.workspace.id, "kathmandu-fitness-club": kfc.id })}`,
  );
  console.log(`SEED_ORGANIZATIONS=${JSON.stringify({ "himalayan-threads": htOrg.id, "everest-coffee-roasters": ecOrg.id, "kathmandu-fitness-club": kfcOrg.id })}`);
  console.log(`SEED_INVITE=/invite/${DEMO_INVITE_TOKEN}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
