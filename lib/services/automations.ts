/**
 * Automations service: every function takes `workspaceId` first and scopes
 * each query by it. Route handlers and server components call these; the
 * engine (lib/automation/*) reads the same rows at runtime.
 */
import {
  AutomationStatus,
  ChannelStatus,
  DeliveryKind,
  DeliveryStatus,
  JobType,
  MatchMode,
  Prisma,
  TriggerType,
  type Automation,
  type Channel,
  type ChannelPlatform,
} from "@prisma/client";
import { z } from "zod";

import {
  defaultFlow,
  describeFlowErrors,
  emptyFlow,
  findTriggerNode,
  flowGraphSchema,
  getNode,
  nextNodeId,
  validateFlow,
  type FlowGraph,
  type FlowNodeData,
} from "@/lib/automation/flow-types";
import { matchedKeyword, normalizeText } from "@/lib/automation/matcher";
import { contactTemplateVars, renderMessage } from "@/lib/automation/send";
import { checkLimit } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { OutboundMessage } from "@/lib/meta/types";
import { enqueue } from "@/lib/queue";
import { getTemplate, instantiateTemplate } from "@/lib/services/templates";
import { recordAudit } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";
import { customerReason } from "@/lib/errors/customer-messages";

// ───────────────────────── Validation ─────────────────────────

const keywordSchema = z.string().trim().min(1, "Keywords can't be empty").max(80, "Keywords must be 80 characters or fewer");

export const automationInputSchema = z.object({
  name: z.string().trim().min(1, "Give the automation a name").max(80, "Name must be 80 characters or fewer"),
  channelId: z.string().min(1, "Pick a channel"),
  triggerType: z.nativeEnum(TriggerType),
  matchMode: z.nativeEnum(MatchMode),
  keywords: z.array(keywordSchema).max(100),
  excludeKeywords: z.array(keywordSchema).max(100),
  mediaIds: z.array(z.string().trim().min(1).max(128)).max(500),
  flow: flowGraphSchema,
  publicReplyEnabled: z.boolean(),
  publicReplies: z.array(z.string().trim().min(1, "Replies can't be empty").max(500)).max(25),
  oncePerContact: z.boolean(),
});
export type AutomationInput = z.infer<typeof automationInputSchema>;

export const automationUpdateSchema = automationInputSchema.partial().strict();
export type AutomationUpdateInput = z.infer<typeof automationUpdateSchema>;

/** Creation only needs a channel; everything else comes from the template (or defaults). */
export const automationCreateSchema = automationInputSchema
  .partial()
  .extend({ channelId: z.string().min(1, "Pick a channel"), templateId: z.string().max(64).optional() })
  .strict();
export type AutomationCreateInput = z.infer<typeof automationCreateSchema>;

export const automationStatusSchema = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) });

export const automationTestSchema = z.object({
  text: z.string().max(4000),
  mediaId: z.string().max(128).optional(),
  /** Unsaved builder state, so the Test dialog reflects what's on screen. */
  overrides: automationInputSchema
    .pick({ triggerType: true, matchMode: true, keywords: true, excludeKeywords: true, mediaIds: true, flow: true })
    .partial()
    .optional(),
});
export type AutomationTestInput = z.infer<typeof automationTestSchema>;

export const analyticsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

// ───────────────────────── DTOs ─────────────────────────

export type ChannelOption = {
  id: string;
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  status: ChannelStatus;
};

export type MediaSummary = {
  externalId: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  commentCount: number | null;
};

export type AutomationListItem = {
  id: string;
  name: string;
  status: AutomationStatus;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  channel: ChannelOption;
  /** Posts the automation is limited to; 0 means every post. */
  postCount: number;
  sent7d: number;
  /** Clicks on this automation's tracked links in the last 7 days. */
  clicks7d: number;
  triggeredCount: number;
  sentCount: number;
  lastTriggeredAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type FlowValidation = { ok: true } | { ok: false; errors: string[] };

export type AutomationDetail = {
  id: string;
  name: string;
  status: AutomationStatus;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  excludeKeywords: string[];
  mediaIds: string[];
  flow: FlowGraph;
  /** True when the stored JSON no longer parses; `flow` is then a fresh default. */
  flowRecovered: boolean;
  publicReplyEnabled: boolean;
  publicReplies: string[];
  oncePerContact: boolean;
  triggeredCount: number;
  sentCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  channel: ChannelOption;
  selectedMedia: MediaSummary[];
  validation: FlowValidation;
  /** Everything that must be fixed before the automation can go ACTIVE. */
  activationBlockers: string[];
};

export type AnalyticsPoint = { date: string; triggered: number; sent: number; failed: number; clicks: number };

export type SkipReason = { status: DeliveryStatus; label: string; count: number };

export type RecentDelivery = {
  id: string;
  status: DeliveryStatus;
  kind: DeliveryKind;
  contactId: string | null;
  contactUsername: string | null;
  contactName: string | null;
  messagePreview: string | null;
  /** Plain-language reason for a skip or failure; null when sent. */
  reason: string | null;
  createdAt: string;
};

export type AutomationAnalytics = {
  days: number;
  timezone: string;
  series: AnalyticsPoint[];
  totals: { triggered: number; sent: number; failed: number; clicks: number; publicReplies: number; ctr: number | null };
  skipReasons: SkipReason[];
  recentDeliveries: RecentDelivery[];
};

export type AutomationTestResult = {
  matches: boolean;
  matchedKeyword: string | null;
  reason: string | null;
  /** First message the contact would receive, rendered with sample variables. */
  preview: OutboundMessage | null;
  /** Steps walked before the first message (tags, delays, follow gate). */
  path: string[];
  followGate: boolean;
};

/** Thrown by `setAutomationStatus`; carries the individual blockers for the UI. */
export class ActivationBlockedError extends ApiError {
  constructor(public errors: string[]) {
    super(422, errors.join(" · "), "ACTIVATION_BLOCKED");
    this.name = "ActivationBlockedError";
  }
}

// ───────────────────────── Helpers ─────────────────────────

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_DUPLICATE: "Already sent (duplicate)",
  SKIPPED_RATE_LIMIT: "Rate limited",
  SKIPPED_SELF: "Own comment",
  SKIPPED_NOT_FOLLOWING: "Not following",
  SKIPPED_WINDOW: "Outside 24h window",
  SKIPPED_PLAN_LIMIT: "Plan limit reached",
  SKIPPED_OPTED_OUT: "Opted out",
};

export function deliveryStatusLabel(status: DeliveryStatus): string {
  return DELIVERY_STATUS_LABELS[status];
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function channelOption(channel: Channel): ChannelOption {
  return {
    id: channel.id,
    platform: channel.platform,
    username: channel.username,
    name: channel.name,
    avatarUrl: channel.avatarUrl,
    status: channel.status,
  };
}

function channelHandle(channel: Pick<Channel, "username" | "name">): string {
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? "us";
}

/** Trim, drop empties and case-insensitive duplicates, keep first spelling. */
function cleanKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function cleanReplies(values: string[]): string[] {
  return values.map((v) => v.trim()).filter(Boolean);
}

function cleanMediaIds(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function parseStoredFlow(json: Prisma.JsonValue): { flow: FlowGraph; recovered: boolean } {
  const parsed = flowGraphSchema.safeParse(json);
  return parsed.success ? { flow: parsed.data, recovered: false } : { flow: defaultFlow(), recovered: true };
}

/**
 * Activation rules from ARCHITECTURE §5: an ACTIVE channel, a flow that passes
 * `validateFlow`, and at least one keyword unless the mode is ANY.
 */
function activationBlockers(input: { matchMode: MatchMode; keywords: string[]; flow: FlowGraph }, channel: Pick<Channel, "status">): string[] {
  const blockers: string[] = [];
  if (channel.status !== ChannelStatus.ACTIVE) {
    blockers.push(
      channel.status === ChannelStatus.DISCONNECTED
        ? "This account is disconnected. Reconnect it on the Channels page first."
        : "This account needs to be reconnected on the Channels page first.",
    );
  }
  const validation = validateFlow(input.flow);
  if (!validation.ok) blockers.push(...describeFlowErrors(validation.errors, input.flow));
  if (input.matchMode !== MatchMode.ANY && input.keywords.length === 0) {
    blockers.push("Add at least one keyword, or switch matching to “Any”.");
  }
  return blockers;
}

/**
 * Pipeline steps point at pipelines and stages by id. Those can be deleted
 * after the step was set up, which validateFlow can't see, so check them here.
 * Messages use the same `"<node id>"` form and go through describeFlowErrors.
 */
async function pipelineBlockers(workspaceId: string, flow: FlowGraph): Promise<string[]> {
  const steps = flow.nodes.filter(
    (n): n is FlowGraph["nodes"][number] & { data: Extract<FlowNodeData, { type: "add_to_pipeline" | "move_stage" | "remove_from_pipeline" }> } =>
      (n.data.type === "add_to_pipeline" || n.data.type === "move_stage" || n.data.type === "remove_from_pipeline") && Boolean(n.data.pipelineId),
  );
  if (steps.length === 0) return [];
  const pipelines = await prisma.pipeline.findMany({
    where: { workspaceId, id: { in: steps.map((n) => n.data.pipelineId) } },
    select: { id: true, stages: { select: { id: true } } },
  });
  const stagesByPipeline = new Map(pipelines.map((p) => [p.id, new Set(p.stages.map((st) => st.id))]));
  const errors: string[] = [];
  for (const node of steps) {
    const stages = stagesByPipeline.get(node.data.pipelineId);
    if (!stages) errors.push(`"${node.id}" uses a pipeline that no longer exists. Pick another.`);
    else if (node.data.type !== "remove_from_pipeline" && node.data.stageId && !stages.has(node.data.stageId)) {
      errors.push(`"${node.id}" uses a stage that no longer exists. Pick another.`);
    }
  }
  return describeFlowErrors(errors, flow);
}

async function requireChannel(workspaceId: string, channelId: string): Promise<Channel> {
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId } });
  if (!channel) throw new ApiError(404, "That account isn't connected to this workspace", "CHANNEL_NOT_FOUND");
  return channel;
}

async function requireAutomation(workspaceId: string, id: string): Promise<Automation & { channel: Channel }> {
  const automation = await prisma.automation.findFirst({ where: { id, workspaceId }, include: { channel: true } });
  if (!automation) throw new ApiError(404, "Automation not found", "NOT_FOUND");
  return automation;
}

async function assertCanAdd(workspaceId: string): Promise<void> {
  const limit = await checkLimit(workspaceId, "automations");
  if (!limit.ok) {
    throw new ApiError(403, `Your plan allows ${limit.limit} automation${limit.limit === 1 ? "" : "s"}. Upgrade to add more.`, "PLAN_LIMIT");
  }
}

// ───────────────────────── Channels (in-lane helper) ─────────────────────────

/**
 * Minimal channel listing for the automation pages. The channels lane owns
 * the full service; this only exposes what pickers and table cells need.
 */
export async function listChannelOptions(workspaceId: string): Promise<ChannelOption[]> {
  const channels = await prisma.channel.findMany({
    where: { workspaceId, status: { not: ChannelStatus.DISCONNECTED } },
    orderBy: { createdAt: "asc" },
  });
  return channels.map(channelOption);
}

export type MediaListOptions = { q?: string; limit?: number; refresh?: boolean };

/**
 * Cached posts for the post picker (read from the `Media` table the channels
 * lane keeps in sync). `refresh` queues a SYNC_MEDIA job; the caller re-fetches
 * a few seconds later. Deduped per channel per 5 minutes so a click-happy
 * user can't flood the queue.
 */
export async function listChannelMedia(workspaceId: string, channelId: string, opts: MediaListOptions = {}): Promise<{ items: MediaSummary[]; refreshQueued: boolean }> {
  const channel = await requireChannel(workspaceId, channelId);
  let refreshQueued = false;
  if (opts.refresh) {
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    const job = await enqueue({
      type: JobType.SYNC_MEDIA,
      workspaceId,
      payload: { channelId: channel.id },
      dedupeKey: `sync_media:${channel.id}:${bucket}`,
      maxAttempts: 2,
    });
    refreshQueued = job !== null;
  }
  const q = opts.q?.trim();
  const rows = await prisma.media.findMany({
    where: { channelId: channel.id, ...(q ? { caption: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: [{ timestamp: "desc" }, { syncedAt: "desc" }],
    take: Math.min(Math.max(opts.limit ?? 60, 1), 200),
  });
  return { items: rows.map(mediaSummary), refreshQueued };
}

function mediaSummary(row: {
  externalId: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  timestamp: Date | null;
  commentCount: number | null;
}): MediaSummary {
  return {
    externalId: row.externalId,
    caption: row.caption,
    mediaType: row.mediaType,
    thumbnailUrl: row.thumbnailUrl,
    mediaUrl: row.mediaUrl,
    permalink: row.permalink,
    timestamp: iso(row.timestamp),
    commentCount: row.commentCount,
  };
}

// ───────────────────────── List / get ─────────────────────────

export type AutomationListFilters = { channelId?: string; status?: AutomationStatus; q?: string };

/** Unfiltered total: the list page uses it to tell "nothing yet" apart from "no matches". */
export function countAutomations(workspaceId: string): Promise<number> {
  return prisma.automation.count({ where: { workspaceId } });
}

/** Automations per status for the list tabs, optionally within one channel. */
export async function countAutomationsByStatus(workspaceId: string, channelId?: string): Promise<Record<AutomationStatus, number>> {
  const grouped = await prisma.automation.groupBy({
    by: ["status"],
    where: { workspaceId, ...(channelId ? { channelId } : {}) },
    _count: { _all: true },
  });
  const counts: Record<AutomationStatus, number> = { ACTIVE: 0, PAUSED: 0, DRAFT: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  return counts;
}

export async function listAutomations(workspaceId: string, filters: AutomationListFilters = {}): Promise<AutomationListItem[]> {
  const q = filters.q?.trim();
  const where: Prisma.AutomationWhereInput = {
    workspaceId,
    ...(filters.channelId ? { channelId: filters.channelId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { keywords: { hasSome: [q, q.toLowerCase()] } }] } : {}),
  };
  const automations = await prisma.automation.findMany({ where, include: { channel: true }, orderBy: { updatedAt: "desc" } });
  if (automations.length === 0) return [];

  // "Sent (7d)" counts DMs actually delivered; public replies are not DMs.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const counts = await prisma.deliveryLog.groupBy({
    by: ["automationId"],
    where: {
      workspaceId,
      automationId: { in: automations.map((a) => a.id) },
      status: DeliveryStatus.SENT,
      kind: { in: [DeliveryKind.PRIVATE_REPLY, DeliveryKind.MESSAGE] },
      createdAt: { gte: since },
    },
    _count: { _all: true },
  });
  const sent7d = new Map(counts.map((c) => [c.automationId, c._count._all]));

  const links = await prisma.trackedLink.findMany({
    where: { workspaceId, automationId: { in: automations.map((a) => a.id) } },
    select: { id: true, automationId: true },
  });
  const clickGroups = links.length
    ? await prisma.linkClick.groupBy({ by: ["linkId"], where: { linkId: { in: links.map((l) => l.id) }, createdAt: { gte: since } }, _count: { _all: true } })
    : [];
  const automationByLink = new Map(links.map((l) => [l.id, l.automationId]));
  const clicks7d = new Map<string, number>();
  for (const g of clickGroups) {
    const automationId = automationByLink.get(g.linkId);
    if (automationId) clicks7d.set(automationId, (clicks7d.get(automationId) ?? 0) + g._count._all);
  }

  return automations.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    triggerType: a.triggerType,
    matchMode: a.matchMode,
    keywords: a.keywords,
    channel: channelOption(a.channel),
    postCount: a.mediaIds.length,
    sent7d: sent7d.get(a.id) ?? 0,
    clicks7d: clicks7d.get(a.id) ?? 0,
    triggeredCount: a.triggeredCount,
    sentCount: a.sentCount,
    lastTriggeredAt: iso(a.lastTriggeredAt),
    updatedAt: a.updatedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  }));
}

async function toDetail(automation: Automation & { channel: Channel }): Promise<AutomationDetail> {
  const { flow, recovered } = parseStoredFlow(automation.flow);
  const selectedMedia =
    automation.mediaIds.length > 0
      ? await prisma.media.findMany({ where: { channelId: automation.channelId, externalId: { in: automation.mediaIds } } })
      : [];
  const checked = validateFlow(flow);
  const validation: FlowValidation = checked.ok ? checked : { ok: false, errors: describeFlowErrors(checked.errors, flow) };
  return {
    id: automation.id,
    name: automation.name,
    status: automation.status,
    triggerType: automation.triggerType,
    matchMode: automation.matchMode,
    keywords: automation.keywords,
    excludeKeywords: automation.excludeKeywords,
    mediaIds: automation.mediaIds,
    flow,
    flowRecovered: recovered,
    publicReplyEnabled: automation.publicReplyEnabled,
    publicReplies: automation.publicReplies,
    oncePerContact: automation.oncePerContact,
    triggeredCount: automation.triggeredCount,
    sentCount: automation.sentCount,
    lastTriggeredAt: iso(automation.lastTriggeredAt),
    createdAt: automation.createdAt.toISOString(),
    updatedAt: automation.updatedAt.toISOString(),
    channel: channelOption(automation.channel),
    selectedMedia: selectedMedia.map(mediaSummary),
    validation,
    activationBlockers: [
      ...activationBlockers({ matchMode: automation.matchMode, keywords: automation.keywords, flow }, automation.channel),
      ...(await pipelineBlockers(automation.workspaceId, flow)),
    ],
  };
}

export async function getAutomation(workspaceId: string, id: string): Promise<AutomationDetail | null> {
  const automation = await prisma.automation.findFirst({ where: { id, workspaceId }, include: { channel: true } });
  return automation ? toDetail(automation) : null;
}

// ───────────────────────── Create / update / delete ─────────────────────────

export async function createAutomation(workspaceId: string, input: AutomationCreateInput, actorUserId?: string): Promise<AutomationDetail> {
  await assertCanAdd(workspaceId);
  const channel = await requireChannel(workspaceId, input.channelId);

  const template = input.templateId ? getTemplate(input.templateId) : null;
  if (input.templateId && !template) throw new ApiError(404, "Template not found", "TEMPLATE_NOT_FOUND");
  const base = template ? instantiateTemplate(template, { accountHandle: channelHandle(channel) }) : null;

  const flow = input.flow ?? base?.flow ?? emptyFlow();
  const created = await prisma.automation.create({
    data: {
      workspaceId,
      channelId: channel.id,
      name: input.name ?? base?.name ?? "Untitled automation",
      status: AutomationStatus.DRAFT,
      triggerType: input.triggerType ?? base?.triggerType ?? TriggerType.COMMENT,
      matchMode: input.matchMode ?? base?.matchMode ?? MatchMode.CONTAINS,
      keywords: cleanKeywords(input.keywords ?? base?.keywords ?? []),
      excludeKeywords: cleanKeywords(input.excludeKeywords ?? []),
      mediaIds: cleanMediaIds(input.mediaIds ?? []),
      flow: toJson(flow),
      publicReplyEnabled: input.publicReplyEnabled ?? base?.publicReplyEnabled ?? false,
      publicReplies: cleanReplies(input.publicReplies ?? base?.publicReplies ?? []),
      oncePerContact: input.oncePerContact ?? true,
    },
    include: { channel: true },
  });

  await recordAudit({
    workspaceId,
    userId: actorUserId,
    action: "automation.created",
    targetType: "automation",
    targetId: created.id,
    metadata: { templateId: template?.id ?? null, channelId: channel.id },
  });
  logger.info("automation.created", { workspaceId, automationId: created.id, templateId: template?.id ?? null });
  return toDetail(created);
}

export type UpdateAutomationResult = { automation: AutomationDetail; warnings: string[] };

/**
 * Saves the editor state. Drafts may be saved in any shape (work in progress);
 * an ACTIVE automation that no longer satisfies the activation rules is
 * demoted to PAUSED and the reasons are returned as warnings rather than
 * blocking the save: losing edits is worse than a paused automation.
 */
export async function updateAutomation(workspaceId: string, id: string, input: AutomationUpdateInput, actorUserId?: string): Promise<UpdateAutomationResult> {
  const existing = await requireAutomation(workspaceId, id);
  const channel = input.channelId && input.channelId !== existing.channelId ? await requireChannel(workspaceId, input.channelId) : existing.channel;

  const stored = parseStoredFlow(existing.flow);
  const merged = {
    name: input.name ?? existing.name,
    triggerType: input.triggerType ?? existing.triggerType,
    matchMode: input.matchMode ?? existing.matchMode,
    keywords: cleanKeywords(input.keywords ?? existing.keywords),
    excludeKeywords: cleanKeywords(input.excludeKeywords ?? existing.excludeKeywords),
    mediaIds: cleanMediaIds(input.mediaIds ?? existing.mediaIds),
    flow: input.flow ?? stored.flow,
    publicReplyEnabled: input.publicReplyEnabled ?? existing.publicReplyEnabled,
    publicReplies: cleanReplies(input.publicReplies ?? existing.publicReplies),
    oncePerContact: input.oncePerContact ?? existing.oncePerContact,
  };

  const warnings: string[] = [];
  let status = existing.status;
  if (status === AutomationStatus.ACTIVE) {
    const blockers = [...activationBlockers(merged, channel), ...(await pipelineBlockers(workspaceId, merged.flow))];
    if (blockers.length > 0) {
      status = AutomationStatus.PAUSED;
      warnings.push(...blockers);
    }
  }

  const updated = await prisma.automation.update({
    where: { id, workspaceId },
    data: { ...merged, flow: toJson(merged.flow), channelId: channel.id, status },
    include: { channel: true },
  });

  if (status !== existing.status) {
    await recordAudit({
      workspaceId,
      userId: actorUserId,
      action: "automation.auto_paused",
      targetType: "automation",
      targetId: id,
      metadata: { reasons: warnings },
    });
    logger.warn("automation.auto_paused", { workspaceId, automationId: id, reasons: warnings });
  }
  return { automation: await toDetail(updated), warnings };
}

export async function setAutomationStatus(workspaceId: string, id: string, status: "ACTIVE" | "PAUSED", actorUserId?: string): Promise<AutomationDetail> {
  const existing = await requireAutomation(workspaceId, id);
  if (status === "ACTIVE") {
    const { flow } = parseStoredFlow(existing.flow);
    const blockers = [
      ...activationBlockers({ matchMode: existing.matchMode, keywords: existing.keywords, flow }, existing.channel),
      ...(await pipelineBlockers(workspaceId, flow)),
    ];
    if (blockers.length > 0) throw new ActivationBlockedError(blockers);
  }
  const updated = await prisma.automation.update({ where: { id, workspaceId }, data: { status }, include: { channel: true } });
  await recordAudit({
    workspaceId,
    userId: actorUserId,
    action: status === "ACTIVE" ? "automation.activated" : "automation.paused",
    targetType: "automation",
    targetId: id,
  });
  logger.info("automation.status_changed", { workspaceId, automationId: id, status });
  return toDetail(updated);
}

export async function duplicateAutomation(workspaceId: string, id: string, actorUserId?: string): Promise<AutomationDetail> {
  await assertCanAdd(workspaceId);
  const source = await requireAutomation(workspaceId, id);
  const name = `${source.name} (copy)`.slice(0, 80);
  const created = await prisma.automation.create({
    data: {
      workspaceId,
      channelId: source.channelId,
      name,
      status: AutomationStatus.DRAFT,
      triggerType: source.triggerType,
      matchMode: source.matchMode,
      keywords: source.keywords,
      excludeKeywords: source.excludeKeywords,
      mediaIds: source.mediaIds,
      flow: toJson(source.flow),
      publicReplyEnabled: source.publicReplyEnabled,
      publicReplies: source.publicReplies,
      oncePerContact: source.oncePerContact,
    },
    include: { channel: true },
  });
  await recordAudit({
    workspaceId,
    userId: actorUserId,
    action: "automation.duplicated",
    targetType: "automation",
    targetId: created.id,
    metadata: { sourceId: source.id },
  });
  return toDetail(created);
}

export async function deleteAutomation(workspaceId: string, id: string, actorUserId?: string): Promise<void> {
  const result = await prisma.automation.deleteMany({ where: { id, workspaceId } });
  if (result.count === 0) throw new ApiError(404, "Automation not found", "NOT_FOUND");
  await recordAudit({ workspaceId, userId: actorUserId, action: "automation.deleted", targetType: "automation", targetId: id });
  logger.info("automation.deleted", { workspaceId, automationId: id });
}

// ───────────────────────── Test (dry run) ─────────────────────────

const SAMPLE_CONTACT = { username: "sita.rai", name: "Sita Rai" };

function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * Dry run: would this text trigger the automation, and what is the first
 * message it would send? Nothing is sent or logged. Overrides let the builder
 * test unsaved changes.
 */
export async function testAutomation(workspaceId: string, id: string, input: AutomationTestInput): Promise<AutomationTestResult> {
  const automation = await requireAutomation(workspaceId, id);
  const o = input.overrides ?? {};
  const triggerType = o.triggerType ?? automation.triggerType;
  const matchMode = o.matchMode ?? automation.matchMode;
  const keywords = cleanKeywords(o.keywords ?? automation.keywords);
  const excludeKeywords = cleanKeywords(o.excludeKeywords ?? automation.excludeKeywords);
  const mediaIds = cleanMediaIds(o.mediaIds ?? automation.mediaIds);
  const flow = o.flow ?? parseStoredFlow(automation.flow).flow;

  let matches = true;
  let reason: string | null = null;
  let matched: string | null = null;

  if (triggerType === TriggerType.COMMENT && mediaIds.length > 0 && (!input.mediaId || !mediaIds.includes(input.mediaId))) {
    matches = false;
    reason = input.mediaId ? "This post isn't in the automation's selected posts" : "This automation only runs on specific posts. Pick one to test with.";
  } else {
    matched = matchedKeyword(input.text, keywords, matchMode, excludeKeywords);
    if (!matched) {
      matches = false;
      const normalized = normalizeText(input.text);
      const excluded = excludeKeywords.find((k) => normalized.includes(normalizeText(k)));
      if (excluded) reason = `Contains the excluded keyword “${excluded}”`;
      else if (matchMode !== MatchMode.ANY && keywords.length === 0) reason = "No keywords yet. Add one, or switch matching to “Any”.";
      else reason = matchMode === MatchMode.EXACT ? "No keyword appears as a whole word" : "No keyword found in the text";
    }
  }

  // Walk to the first message the contact would see, following the "happy" branch.
  const vars = contactTemplateVars(SAMPLE_CONTACT);
  const path: string[] = [];
  let preview: OutboundMessage | null = null;
  let followGate = false;
  const trigger = findTriggerNode(flow);
  let cursor = trigger ? nextNodeId(flow, trigger.id, "next") : null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = getNode(flow, cursor);
    if (!node) break;
    const data = node.data;
    if (data.type === "send_message") {
      preview = renderMessage(data.message, vars);
      break;
    }
    if (data.type === "ask_question") {
      // The question is the first thing they see; the flow then waits for their answer.
      preview = renderMessage(data.prompt, vars);
      break;
    }
    if (data.type === "condition_follow") {
      followGate = true;
      path.push("Follow check (assuming they follow)");
      cursor = nextNodeId(flow, node.id, "yes");
      continue;
    }
    if (data.type === "delay") {
      path.push(`Wait ${formatDuration(data.seconds)}`);
    } else if (data.type === "add_tag") {
      path.push(`Add tag “${data.tag}”`);
    } else if (data.type === "remove_tag") {
      path.push(`Remove tag “${data.tag}”`);
    } else if (data.type === "add_to_pipeline") {
      path.push("Add to a pipeline");
    } else if (data.type === "move_stage") {
      path.push("Move to a stage");
    } else if (data.type === "remove_from_pipeline") {
      path.push("Remove from a pipeline");
    }
    cursor = nextNodeId(flow, node.id, "next");
  }

  return { matches, matchedKeyword: matched === "*" ? null : matched, reason, preview, path, followGate };
}

// ───────────────────────── Analytics ─────────────────────────

type DayCountRow = { day: string; count: number };
type DayStatusRow = { day: string; status: string; count: number };

/** Only IANA-looking names reach the SQL `AT TIME ZONE`; anything odd falls back to UTC. */
function safeTimezone(tz: string | null | undefined): string {
  if (!tz || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(tz)) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function dayKey(date: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the key Postgres' to_char produces.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** UTC instant at which the local calendar day `key` starts in `tz`. */
function startOfDayInTz(key: string, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}

/** The latest delivery attempts for one automation, newest first, with customer-safe reasons. */
export async function listRecentDeliveries(workspaceId: string, automationId: string, limit = 20): Promise<RecentDelivery[]> {
  const rows = await prisma.deliveryLog.findMany({
    where: { workspaceId, automationId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { contact: { select: { id: true, username: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    kind: r.kind,
    contactId: r.contact?.id ?? r.contactId,
    contactUsername: r.contact?.username ?? r.recipientUsername,
    contactName: r.contact?.name ?? null,
    messagePreview: r.messagePreview,
    reason: customerReason(r.status, r.errorMessage),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getAutomationAnalytics(workspaceId: string, id: string, days = 30): Promise<AutomationAnalytics> {
  const [automation, workspace] = await Promise.all([
    requireAutomation(workspaceId, id),
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } }),
  ]);
  const tz = safeTimezone(workspace.timezone);
  const span = Math.min(Math.max(days, 1), 365);

  // Calendar days in the workspace timezone, oldest first; today is the last bucket.
  const now = new Date();
  const keys: string[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const key = dayKey(new Date(now.getTime() - i * 86_400_000), tz);
    if (!keys.includes(key)) keys.push(key);
  }
  const since = startOfDayInTz(keys[0], tz);
  const day = Prisma.sql`to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;

  const [sessionRows, deliveryRows, clickRows, publicReplyCount, skipGroups, recent] = await Promise.all([
    prisma.$queryRaw<DayCountRow[]>(Prisma.sql`
      SELECT ${day} AS day, COUNT(*)::int AS count
      FROM "FlowSession"
      WHERE "workspaceId" = ${workspaceId} AND "automationId" = ${automation.id} AND "createdAt" >= ${since}
      GROUP BY 1`),
    prisma.$queryRaw<DayStatusRow[]>(Prisma.sql`
      SELECT ${day} AS day, "status"::text AS status, COUNT(*)::int AS count
      FROM "DeliveryLog"
      WHERE "workspaceId" = ${workspaceId} AND "automationId" = ${automation.id} AND "createdAt" >= ${since}
        AND "kind" <> 'PUBLIC_REPLY'
      GROUP BY 1, 2`),
    prisma.$queryRaw<DayCountRow[]>(Prisma.sql`
      SELECT to_char((c."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM "LinkClick" c
      JOIN "TrackedLink" l ON l."id" = c."linkId"
      WHERE l."workspaceId" = ${workspaceId} AND l."automationId" = ${automation.id} AND c."createdAt" >= ${since}
      GROUP BY 1`),
    prisma.deliveryLog.count({
      where: { workspaceId, automationId: automation.id, kind: DeliveryKind.PUBLIC_REPLY, status: DeliveryStatus.SENT, createdAt: { gte: since } },
    }),
    prisma.deliveryLog.groupBy({
      by: ["status"],
      where: {
        workspaceId,
        automationId: automation.id,
        status: { not: DeliveryStatus.SENT },
        kind: { not: DeliveryKind.PUBLIC_REPLY },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    }),
    prisma.deliveryLog.findMany({
      where: { workspaceId, automationId: automation.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { contact: { select: { id: true, username: true, name: true } } },
    }),
  ]);

  const byDay = new Map<string, AnalyticsPoint>(keys.map((date) => [date, { date, triggered: 0, sent: 0, failed: 0, clicks: 0 }]));
  for (const row of sessionRows) {
    const point = byDay.get(row.day);
    if (point) point.triggered += row.count;
  }
  for (const row of deliveryRows) {
    const point = byDay.get(row.day);
    if (!point) continue;
    if (row.status === DeliveryStatus.SENT) point.sent += row.count;
    else point.failed += row.count;
  }
  for (const row of clickRows) {
    const point = byDay.get(row.day);
    if (point) point.clicks += row.count;
  }

  const series = keys.map((k) => byDay.get(k) as AnalyticsPoint);
  const totals = series.reduce(
    (acc, p) => ({ triggered: acc.triggered + p.triggered, sent: acc.sent + p.sent, failed: acc.failed + p.failed, clicks: acc.clicks + p.clicks }),
    { triggered: 0, sent: 0, failed: 0, clicks: 0 },
  );

  const isDeliveryStatus = (value: string): value is DeliveryStatus => value in DELIVERY_STATUS_LABELS;
  const skipReasons: SkipReason[] = skipGroups
    .filter((g) => isDeliveryStatus(g.status))
    .map((g) => ({ status: g.status, label: DELIVERY_STATUS_LABELS[g.status], count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    days: span,
    timezone: tz,
    series,
    totals: { ...totals, publicReplies: publicReplyCount, ctr: totals.sent > 0 ? totals.clicks / totals.sent : null },
    skipReasons,
    recentDeliveries: recent.map((r) => ({
      id: r.id,
      status: r.status,
      kind: r.kind,
      contactId: r.contact?.id ?? r.contactId,
      contactUsername: r.contact?.username ?? r.recipientUsername,
      contactName: r.contact?.name ?? null,
      messagePreview: r.messagePreview,
      reason: customerReason(r.status, r.errorMessage),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
