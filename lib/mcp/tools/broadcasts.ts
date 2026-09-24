/**
 * Broadcasts and tracked links as tools. A broadcast reaches real people, so
 * sending one carries the same per-person rate limit and plan checks as the
 * Broadcasts page.
 */
import { z } from "zod";

import { limitsFor } from "@/lib/billing/plans";
import { effectivePlan } from "@/lib/billing/entitlements";
import { assertRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import {
  audienceForEstimate,
  cancelBroadcast,
  createBroadcast,
  createBroadcastSchema,
  deleteBroadcast,
  estimateAudience,
  estimateAudienceSchema,
  getBroadcast,
  listBroadcasts,
  sendBroadcast,
  toBroadcastRow,
  updateBroadcast,
  updateBroadcastSchema,
} from "@/lib/services/broadcasts";
import {
  createLinkSchema,
  createTrackedLink,
  deleteTrackedLink,
  getLinkStats,
  linkListQuerySchema,
  linkStatsQuerySchema,
  listTrackedLinks,
  updateLinkSchema,
  updateTrackedLink,
} from "@/lib/services/links";
import { ApiError } from "@/lib/workspace/api";

import { compact, workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

/** Same budget as POST /api/broadcasts/[id]/send: each send fans out into one job per contact. */
const SEND_LIMIT_PER_MINUTE = 10;

const broadcastId = z.string().describe("Broadcast id from list_broadcasts.");
const linkId = z.string().describe("Link id from list_links.");

const broadcastMessage = z
  .object({
    text: z.string().max(4000).optional().describe("Up to about 1,000 characters, or 640 with buttons. May use {{first_name|there}} and other contact fields."),
    buttons: z
      .array(z.object({ type: z.literal("web_url").optional(), title: z.string().describe("Up to 20 characters."), url: z.string().describe("https:// link.") }))
      .max(3)
      .optional()
      .describe("Link buttons only."),
    imageUrl: z.string().optional().describe("https:// link to an image."),
  })
  .describe("Needs text or an image.");

const audience = z
  .object({
    tags: z.array(z.string()).max(50).optional().describe("Contacts with these tags (see tagMode). Empty means everyone on the account."),
    tagMode: z.enum(["all", "any"]).optional().describe("Defaults to any."),
    excludeTags: z.array(z.string()).max(50).optional(),
    onlyFollowers: z.boolean().optional(),
    lastInteractionDays: z.number().int().min(1).max(365).nullable().optional().describe("Interacted within the last N days."),
    q: z.string().max(120).optional().describe("Name or @username contains."),
    segmentId: z.string().nullable().optional().describe("The saved segment these filters came from, for display."),
  })
  .describe("Who gets it. Only people inside the 24-hour reply window receive a broadcast; the estimate says how many that is now.");

function broadcastInput(args: { name?: string; channelId?: string; message?: z.infer<typeof broadcastMessage>; audience?: z.infer<typeof audience>; scheduledAt?: string | null }) {
  return compact({
    name: args.name,
    channelId: args.channelId,
    message: args.message ? compact({ ...args.message, buttons: args.message.buttons?.map((b) => ({ type: "web_url" as const, title: b.title, url: b.url })) }) : undefined,
    audience: args.audience ? compact(args.audience) : undefined,
    scheduledAt: args.scheduledAt,
  });
}

export const broadcastTools = [
  workspaceTool({
    name: "list_broadcasts",
    title: "List broadcasts",
    description: "Broadcasts, newest first, with status (DRAFT, SCHEDULED, SENDING, SENT, CANCELLED, FAILED), account, audience and delivery counts. Also says whether the plan includes broadcasts.",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => ({
      broadcasts: (await listBroadcasts(ctx.workspace.id)).map(toBroadcastRow),
      plan: { broadcasts: limitsFor(effectivePlan(ctx.organization)).broadcasts },
    }),
  }),

  workspaceTool({
    name: "get_broadcast",
    title: "Get a broadcast",
    description: "One broadcast with its message, audience, delivery stats and the first page of deliveries.",
    annotations: READ,
    input: { broadcastId },
    run: async (args, ctx) => {
      const detail = await getBroadcast(ctx.workspace.id, args.broadcastId);
      if (!detail) throw new ApiError(404, "Broadcast not found", "NOT_FOUND");
      return { broadcast: toBroadcastRow(detail), stats: detail.stats, deliveries: detail.deliveries, deliveryTotal: detail.deliveryTotal };
    },
  }),

  workspaceTool({
    name: "estimate_broadcast_audience",
    title: "Estimate a broadcast's reach",
    description: "How many contacts match an audience on an account, and how many are inside the reply window and would actually receive it now. Pass segmentId to estimate a saved segment.",
    annotations: READ,
    input: { channelId: z.string(), audience: audience.optional(), segmentId: z.string().optional() },
    run: async (args, ctx) => {
      const parsed = estimateAudienceSchema.parse(compact({ channelId: args.channelId, audience: args.audience ? compact(args.audience) : undefined, segmentId: args.segmentId }));
      const resolved = await audienceForEstimate(ctx.workspace.id, { audience: parsed.audience, segmentId: parsed.segmentId });
      return { ...(await estimateAudience(ctx.workspace.id, parsed.channelId, resolved)), audience: resolved };
    },
  }),

  workspaceTool({
    name: "create_broadcast",
    title: "Create a broadcast",
    description:
      "Create a broadcast as a draft, or scheduled when scheduledAt is given. Nothing is sent until send_broadcast or the scheduled time. Plans without broadcasts refuse it.",
    annotations: WRITE,
    input: {
      name: z.string().describe("Up to 80 characters, for your own list."),
      channelId: z.string().describe("The account it is sent from."),
      message: broadcastMessage,
      audience: audience.optional(),
      scheduledAt: z.string().nullable().optional().describe("ISO 8601 time with a timezone offset, such as 2026-10-01T09:00:00+05:45. Leave out for a draft."),
    },
    run: async (args, ctx) => ({ broadcast: await createBroadcast(ctx.workspace.id, createBroadcastSchema.parse(broadcastInput(args)), ctx.user.id) }),
  }),

  workspaceTool({
    name: "update_broadcast",
    title: "Update a broadcast",
    description: "Edit a draft or scheduled broadcast. scheduledAt null turns a scheduled one back into a draft.",
    annotations: WRITE,
    input: {
      broadcastId,
      name: z.string().optional(),
      channelId: z.string().optional(),
      message: broadcastMessage.optional(),
      audience: audience.optional(),
      scheduledAt: z.string().nullable().optional(),
    },
    run: async (args, ctx) => {
      const { broadcastId: id, ...fields } = args;
      return { broadcast: await updateBroadcast(ctx.workspace.id, id, updateBroadcastSchema.parse(broadcastInput(fields)), ctx.user.id) };
    },
  }),

  workspaceTool({
    name: "send_broadcast",
    title: "Send a broadcast now",
    description:
      "Start sending a draft or scheduled broadcast now. It goes to everyone in the audience inside the reply window and counts toward the plan's monthly DMs. This messages real people: confirm the message and the estimate with the user first.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    input: { broadcastId },
    run: async (args, ctx) => {
      assertRateLimit("broadcast_send", ctx.user.id, SEND_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
      return sendBroadcast(ctx.workspace.id, args.broadcastId, ctx.user.id);
    },
  }),

  workspaceTool({
    name: "cancel_broadcast",
    title: "Cancel a broadcast",
    description: "Stop a scheduled broadcast, or the rest of one that is sending.",
    annotations: DESTROY,
    input: { broadcastId },
    run: async (args, ctx) => cancelBroadcast(ctx.workspace.id, args.broadcastId, ctx.user.id),
  }),

  workspaceTool({
    name: "delete_broadcast",
    title: "Delete a broadcast",
    description: "Delete a draft, cancelled, sent or failed broadcast.",
    annotations: DESTROY,
    input: { broadcastId },
    run: async (args, ctx) => {
      await deleteBroadcast(ctx.workspace.id, args.broadcastId, ctx.user.id);
      return { ok: true };
    },
  }),

];

export const linkTools = [
  workspaceTool({
    name: "list_links",
    title: "List tracked links",
    description: "Tracked short links, newest first, with their destination, the automation or broadcast they belong to and click counts.",
    annotations: READ,
    input: {
      automationId: z.string().optional(),
      broadcastId: z.string().optional(),
      q: z.string().max(120).optional().describe("Search label, slug or destination."),
    },
    run: async (args, ctx) => ({ items: await listTrackedLinks(ctx.workspace.id, linkListQuerySchema.parse(compact(args))) }),
  }),

  workspaceTool({
    name: "get_link_stats",
    title: "Tracked link clicks",
    description: "Daily clicks for one tracked link, the total in range and the latest clicks.",
    annotations: READ,
    input: { linkId, days: z.number().int().min(1).max(90).optional().describe("Defaults to 30.") },
    run: async (args, ctx) => {
      const { days } = linkStatsQuerySchema.parse(compact({ days: args.days }));
      return getLinkStats(ctx.workspace.id, args.linkId, days, ctx.workspace.timezone);
    },
  }),

  workspaceTool({
    name: "create_link",
    title: "Create a tracked link",
    description: "Make a short link that counts clicks before sending people to destinationUrl. Use its url in messages and buttons.",
    annotations: WRITE,
    input: {
      destinationUrl: z.string().describe("Where it leads: a full http:// or https:// URL."),
      label: z.string().optional(),
      automationId: z.string().optional().describe("Group its clicks under this automation."),
      broadcastId: z.string().optional().describe("Group its clicks under this broadcast."),
      slug: z.string().optional().describe("Custom path, 3 to 32 letters, numbers, dashes or underscores."),
    },
    run: async (args, ctx) => ({ link: await createTrackedLink(ctx.workspace.id, createLinkSchema.parse(compact(args))) }),
  }),

  workspaceTool({
    name: "update_link",
    title: "Update a tracked link",
    description: "Change where a tracked link leads, or its label. Messages already sent keep working and go to the new destination.",
    annotations: WRITE,
    input: { linkId, destinationUrl: z.string().optional(), label: z.string().nullable().optional() },
    run: async (args, ctx) => {
      const { linkId: id, ...fields } = args;
      return { link: await updateTrackedLink(ctx.workspace.id, id, updateLinkSchema.parse(compact(fields))) };
    },
  }),

  workspaceTool({
    name: "delete_link",
    title: "Delete a tracked link",
    description: "Delete a tracked link and its clicks. Messages that used it stop redirecting. Confirm with the person first.",
    annotations: DESTROY,
    input: { linkId },
    run: async (args, ctx) => {
      await deleteTrackedLink(ctx.workspace.id, args.linkId);
      return { ok: true };
    },
  }),
];
