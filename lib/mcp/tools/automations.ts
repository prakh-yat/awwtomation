/**
 * Connected accounts and automations: the dashboard's accounts dialog and the
 * automation builder as tools.
 */
import { AutomationStatus, MatchMode, TriggerType } from "@prisma/client";
import { z } from "zod";

import { appUrl } from "@/lib/env";
import { disconnectChannel, getChannelSummary, listChannelMedia, listChannels, purgeChannel, refreshChannel, toChannelView } from "@/lib/services/channels";
import {
  automationCreateSchema,
  automationUpdateSchema,
  createAutomation,
  deleteAutomation,
  duplicateAutomation,
  getAutomation,
  getAutomationAnalytics,
  listAutomations,
  setAutomationStatus,
  testAutomation,
  updateAutomation,
} from "@/lib/services/automations";
import { listTemplateSummaries } from "@/lib/services/templates";
import { ApiError } from "@/lib/workspace/api";

import { AUTOMATION_GUIDE, flowInput, toFlowGraph } from "../flow";
import { accountTool, compact, workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const automationId = z.string().describe("Automation id from list_automations.");
const channelId = z.string().describe("A connected account's id (channelId from list_accounts).");

/** The builder's editable fields, as a model writes them. */
const automationFields = {
  name: z.string().optional().describe("Up to 80 characters."),
  triggerType: z.nativeEnum(TriggerType).optional().describe("COMMENT, DM or STORY_REPLY."),
  matchMode: z.nativeEnum(MatchMode).optional().describe("CONTAINS, EXACT or ANY (every comment or message)."),
  keywords: z.array(z.string()).optional().describe("Words that start it. Ignored when matchMode is ANY."),
  excludeKeywords: z.array(z.string()).optional().describe("Words that stop a match."),
  mediaIds: z.array(z.string()).optional().describe("COMMENT only: post or reel ids (externalId from list_posts). Empty means every post."),
  flow: flowInput.optional(),
  publicReplyEnabled: z.boolean().optional().describe("COMMENT only: also reply publicly under the comment."),
  publicReplies: z.array(z.string()).optional().describe("Short public replies; one is picked at random."),
  oncePerContact: z.boolean().optional().describe("Send this automation to each person only once."),
};

type AutomationFieldArgs = { [K in keyof typeof automationFields]?: z.infer<(typeof automationFields)[K]> };

function builderInput(args: AutomationFieldArgs) {
  const { flow, ...rest } = args;
  return compact({ ...rest, flow: flow ? toFlowGraph(flow) : undefined });
}

export const accountTools = [
  workspaceTool({
    name: "list_accounts",
    title: "List connected accounts",
    description: `Instagram accounts and Facebook Pages connected to the workspace, with their health (whether they need reconnecting) and 7-day counts. An account's id is the channelId other tools take. Connecting a new account needs Meta's sign-in in a browser: send the person to ${appUrl("/dashboard?accounts=1")}.`,
    annotations: READ,
    input: {},
    run: async (_args, ctx) => {
      const channels = await listChannels(ctx.workspace.id);
      return { accounts: channels.map(toChannelView), connectUrl: appUrl("/dashboard?accounts=1") };
    },
  }),

  workspaceTool({
    name: "refresh_account",
    title: "Refresh an account",
    description: "Re-read an account's profile from Meta, retry its connection for new comments and messages, and re-sync its posts. Use when an account shows a problem.",
    annotations: WRITE,
    input: { channelId },
    run: async (args, ctx) => ({ account: toChannelView(await refreshChannel(ctx.workspace.id, args.channelId)) }),
  }),

  workspaceTool({
    name: "disconnect_account",
    title: "Disconnect an account",
    description:
      "Disconnect an Instagram account or Facebook Page. By default its contacts, conversations and automations stay (automations stop). With deleteData the account and everything that came from it is deleted for good: owners only. Confirm with the person first.",
    minRole: "ADMIN",
    annotations: DESTROY,
    input: {
      channelId,
      deleteData: z.boolean().optional().describe("Also delete its contacts, conversations, automations and history. Owners only; cannot be undone."),
      confirm: z.string().optional().describe("Required with deleteData: the account's @username (Instagram) or Page name, as a safeguard."),
    },
    run: async (args, ctx) => {
      if (!args.deleteData) return { ok: true, account: toChannelView(await disconnectChannel(ctx.workspace.id, args.channelId, ctx.user.id)) };
      if (ctx.role !== "OWNER") throw new ApiError(403, "Only the owner can delete an account and its data", "FORBIDDEN");
      const channel = await getChannelSummary(ctx.workspace.id, args.channelId);
      if (!channel) throw new ApiError(404, "Channel not found", "NOT_FOUND");
      const accepted = [channel.username, channel.username ? `@${channel.username}` : null, channel.name].filter(Boolean);
      if (!args.confirm || !accepted.includes(args.confirm.trim())) {
        throw new ApiError(422, `confirm must be ${accepted.join(" or ")} to delete this account's data.`, "CONFIRMATION_MISMATCH");
      }
      const result = await purgeChannel(ctx.workspace.id, args.channelId, ctx.user.id);
      return { ok: true, purged: true, ...result };
    },
  }),

  workspaceTool({
    name: "list_posts",
    title: "List posts and reels",
    description: "An account's recent posts and reels with captions and comment counts. Their externalId values are what an automation's mediaIds take.",
    annotations: READ,
    input: {
      channelId,
      q: z.string().max(200).optional().describe("Search captions."),
      refresh: z.boolean().optional().describe("Fetch the latest posts from Meta first."),
      limit: z.number().int().min(1).max(200).optional(),
    },
    run: async (args, ctx) => listChannelMedia(ctx.workspace.id, args.channelId, { q: args.q, limit: args.limit, refresh: args.refresh }),
  }),

];

export const automationTools = [
  accountTool({
    name: "get_automation_guide",
    title: "How to build automations",
    description:
      "How automations and their flows work: triggers, match modes, every step type, branching, template variables and two full examples. Read it before create_automation or update_automation with a flow.",
    annotations: READ,
    input: {},
    run: async () => AUTOMATION_GUIDE,
  }),

  workspaceTool({
    name: "list_automation_templates",
    title: "List automation templates",
    description: "Ready-made automations (link in DM, follow to unlock, collect emails, AI replies and more) with their steps. Pass an id as templateId to create_automation.",
    annotations: READ,
    input: {},
    run: async () => ({
      templates: listTemplateSummaries().map((t) => ({
        templateId: t.id,
        name: t.name,
        description: t.description,
        platform: t.platform,
        goal: t.goal,
        trigger: t.triggerLabel,
        triggerType: t.triggerType,
        keywords: t.keywords,
        followGate: t.followGate,
        steps: t.steps,
      })),
    }),
  }),

  workspaceTool({
    name: "list_automations",
    title: "List automations",
    description: "The workspace's automations with status, trigger, keywords, account and recent sends and clicks.",
    annotations: READ,
    input: {
      channelId: channelId.optional(),
      status: z.nativeEnum(AutomationStatus).optional().describe("DRAFT, ACTIVE or PAUSED."),
      q: z.string().max(100).optional().describe("Search by name or keyword."),
    },
    run: async (args, ctx) => ({ automations: await listAutomations(ctx.workspace.id, compact({ channelId: args.channelId, status: args.status, q: args.q })) }),
  }),

  workspaceTool({
    name: "get_automation",
    title: "Get an automation",
    description: "One automation in full: trigger, keywords, posts, public replies, the whole flow, validation errors and what blocks it from going live.",
    annotations: READ,
    input: { automationId },
    run: async (args, ctx) => {
      const automation = await getAutomation(ctx.workspace.id, args.automationId);
      if (!automation) throw new ApiError(404, "Automation not found", "NOT_FOUND");
      return { automation };
    },
  }),

  workspaceTool({
    name: "create_automation",
    title: "Create an automation",
    description:
      "Create an automation as a draft on one account. Start from a template (templateId) or give the fields yourself; anything left out comes from the template or a simple default. Read get_automation_guide first. Turn it on with set_automation_status.",
    annotations: WRITE,
    input: {
      channelId,
      templateId: z.string().max(64).optional().describe("From list_automation_templates."),
      ...automationFields,
    },
    run: async (args, ctx) => {
      const { channelId: channel, templateId, ...fields } = args;
      const input = automationCreateSchema.parse({ ...builderInput(fields), channelId: channel, ...compact({ templateId }) });
      return { automation: await createAutomation(ctx.workspace.id, input, ctx.user.id) };
    },
  }),

  workspaceTool({
    name: "update_automation",
    title: "Update an automation",
    description:
      "Change an automation's name, trigger, keywords, posts, public replies or flow. A flow you pass replaces the whole flow, so send every step. Changes to a live automation apply to the next comment or message. Returns warnings worth showing the person.",
    annotations: WRITE,
    input: {
      automationId,
      channelId: channelId.optional().describe("Move it to another connected account."),
      ...automationFields,
    },
    run: async (args, ctx) => {
      const { automationId: id, ...fields } = args;
      const input = automationUpdateSchema.parse(builderInput(fields));
      if (Object.keys(input).length === 0) throw new ApiError(422, "Nothing to update.", "VALIDATION");
      return updateAutomation(ctx.workspace.id, id, input, ctx.user.id);
    },
  }),

  workspaceTool({
    name: "set_automation_status",
    title: "Turn an automation on or off",
    description: "ACTIVE starts replying to real comments and messages; PAUSED stops it. When something must be fixed first, the error lists every blocker. Confirm with the person before turning one on.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    input: { automationId, status: z.enum(["ACTIVE", "PAUSED"]) },
    run: async (args, ctx) => ({ automation: await setAutomationStatus(ctx.workspace.id, args.automationId, args.status, ctx.user.id) }),
  }),

  workspaceTool({
    name: "duplicate_automation",
    title: "Duplicate an automation",
    description: "Copy an automation as a new draft.",
    annotations: WRITE,
    input: { automationId },
    run: async (args, ctx) => ({ automation: await duplicateAutomation(ctx.workspace.id, args.automationId, ctx.user.id) }),
  }),

  workspaceTool({
    name: "delete_automation",
    title: "Delete an automation",
    description: "Delete an automation for good. Its delivery history stays in the logs. Confirm with the person first.",
    annotations: DESTROY,
    input: { automationId },
    run: async (args, ctx) => {
      await deleteAutomation(ctx.workspace.id, args.automationId, ctx.user.id);
      return { ok: true };
    },
  }),

  workspaceTool({
    name: "test_automation",
    title: "Test an automation",
    description: "Dry run: would this comment or message trigger the automation, which keyword matched, what steps run first and what the first DM would say. Nothing is sent.",
    annotations: READ,
    input: {
      automationId,
      text: z.string().max(4000).describe("A sample comment or message."),
      mediaId: z.string().max(128).optional().describe("For COMMENT automations limited to posts: the post the sample comment is on."),
    },
    run: async (args, ctx) => testAutomation(ctx.workspace.id, args.automationId, { text: args.text, ...compact({ mediaId: args.mediaId }) }),
  }),

  workspaceTool({
    name: "get_automation_analytics",
    title: "Automation analytics",
    description: "Daily triggered, sent, failed and clicks for one automation, totals with click-through rate, why messages were skipped, and the latest deliveries.",
    annotations: READ,
    input: { automationId, days: z.number().int().min(1).max(365).optional().describe("Defaults to 30.") },
    run: async (args, ctx) => getAutomationAnalytics(ctx.workspace.id, args.automationId, args.days ?? 30),
  }),
];
