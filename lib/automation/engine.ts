/**
 * Automation engine: turns NormalizedEvents into flow sessions and walks
 * flow graphs one interaction at a time.
 *
 * Execution model: a session pauses after every send (`currentNodeId` = the
 * node it is waiting on). It resumes only when the contact interacts:
 * a button tap (`btn:${nodeId}:${i}`), a quick reply (`qr:${nodeId}:${i}`),
 * a follow re-check (`follow_check:${nodeId}`) or a plain reply ("next").
 * An "Ask a question" node parks the same way but marks `context.awaiting`;
 * the contact's next message is then delivered back to that node as
 * `payload.answer` instead of being routed to handles or keyword triggers.
 * Every resume is an EXECUTE_FLOW job whose `fromNodeId` is compared
 * atomically against `currentNodeId`, so a double tap can never run a step twice.
 */
import {
  AutomationStatus,
  ChannelPlatform,
  ChannelStatus,
  ConversationStatus,
  DeliveryKind,
  DeliveryStatus,
  FlowSessionStatus,
  JobType,
  MessageDirection,
  Prisma,
  TriggerType,
  type Automation,
  type Channel,
  type Contact,
  type Conversation,
  type FlowSession,
  type Job,
} from "@prisma/client";
import { z } from "zod";
import { withStepInstruction, type ChatTurn } from "@/lib/ai/agent";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getInstagramUserProfile } from "@/lib/meta/instagram";
import { getChannelToken, markChannelTokenExpired } from "@/lib/meta/tokens";
import {
  MetaApiError,
  MetaTokenError,
  type NormalizedCommentEvent,
  type NormalizedEvent,
  type NormalizedMessageEvent,
  type NormalizedPostbackEvent,
  type OutboundMessage,
} from "@/lib/meta/types";
import { enqueue } from "@/lib/queue";
import { removeContactsFromPipeline, setContactsStage } from "@/lib/services/pipelines";
import {
  DEFAULT_AI_TURNS,
  DEFAULT_ASK_RETRIES,
  DEFAULT_ASK_RETRY_PROMPT,
  firstNodeAfterTrigger,
  flowGraphSchema,
  getNode,
  nextNodeId,
  outgoingEdges,
  validateAnswer,
  type FlowGraph,
  type FlowNodeData,
} from "./flow-types";
import { resolveAgent, runAgent } from "@/lib/services/ai";

import { findMatchingAutomations } from "./matcher";
import { attachPostbackPayloads, contactTemplateVars, RATE_LIMIT_MAX_DEFER_MS, recordDeliveryLog, sendToContact, type SendToContactResult } from "./send";

/** Guard against cycles in a flow graph. */
const MAX_STEPS_PER_RUN = 50;

/**
 * An AI step answers this long after the contact's latest message, so "hi"
 * followed by "i want to order this" gets one reply that reads both.
 */
const AI_QUIET_MS = 4_000;
/** A message that arrives while a reply is being written waits for it, checking this often... */
const AI_WAIT_STEP_MS = 2_000;
/** ...this many times, then gives up. */
const AI_MAX_WAITS = 45;
/** A reply still "being written" after this long crashed; stop waiting for it. */
const AI_BUSY_MS = 90_000;

// ───────────────────────── Session context ─────────────────────────

export type FlowSessionContext = {
  commentId?: string;
  mediaId?: string;
  parentCommentId?: string;
  messageId?: string;
  storyId?: string;
  triggerText?: string;
  /** Template variables; saved answers are added here under their `saveTo` key so later messages can use {{email}} etc. */
  vars?: Record<string, string | undefined>;
  rateLimitRetries?: number;
  lastError?: string;
  /**
   * Set while an ask_question node waits for a reply. Valid only while
   * `session.currentNodeId === awaiting.nodeId`; `attempts` counts the retry
   * prompts already sent. Cleared when the answer is saved or retries run out.
   * An ai_reply node parks the same way, with `attempts` counting its replies.
   */
  awaiting?: { nodeId: string; attempts: number };
  /** When the newest message an AI step has already answered was sent (ISO), so a burst of messages gets one reply. */
  aiAnsweredAt?: string;
  /**
   * Set while an AI step writes and sends a reply. A message that arrives
   * meanwhile waits for that reply instead of getting a second one written
   * without it. `messageId` is the message the reply answers, so a retry of
   * the same job does not wait for itself.
   */
  aiBusy?: { at: string; messageId: string | null };
};

/** A contact's message handed to the step waiting for it. `at` is when they sent it (ISO). */
export type FlowAnswer = { text: string; messageId: string; at?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSessionContext(json: Prisma.JsonValue | null | undefined): FlowSessionContext {
  return isRecord(json) ? (json as FlowSessionContext) : {};
}

function contextJson(context: FlowSessionContext): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(context)) as Prisma.InputJsonValue;
}

export function parseFlow(json: Prisma.JsonValue): FlowGraph | null {
  const parsed = flowGraphSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export const executeFlowPayloadSchema = z.object({
  sessionId: z.string().min(1),
  nodeId: z.string().min(1),
  /** When set, the step only runs if the session is still parked on this node (null = fresh session). */
  fromNodeId: z.string().nullable().optional(),
  viaPrivateReplyCommentId: z.string().optional(),
  /** The contact's reply to a pending ask_question or ai_reply node (`nodeId` is that node). */
  answer: z.object({ text: z.string().max(4000), messageId: z.string().min(1), at: z.string().max(40).optional() }).optional(),
  /** How many times an AI turn has already waited for a reply in progress. */
  aiWaits: z.number().int().min(0).max(1000).optional(),
});
export type ExecuteFlowPayload = z.infer<typeof executeFlowPayloadSchema>;

// ───────────────────────── Contacts & conversations ─────────────────────────

export type UpsertContactInput = { externalId: string; username?: string; name?: string; avatarUrl?: string; interactedAt?: Date };

/**
 * Contacts are keyed by (channelId, externalId). For Instagram the comment
 * `from.id` IS the IGSID later seen as `sender.id` on DMs, so comment and DM
 * activity land on one contact. For Facebook, a comment's `from.id` is an
 * app-scoped user id, not a PSID: it can only be reached through a private
 * reply; when that person answers in Messenger their PSID creates a separate
 * Contact. We accept that split rather than guess at identity.
 */
export async function upsertContact(channel: Channel, input: UpsertContactInput): Promise<Contact> {
  const update: Prisma.ContactUpdateInput = {};
  if (input.username) update.username = input.username;
  if (input.name) update.name = input.name;
  if (input.avatarUrl) update.avatarUrl = input.avatarUrl;
  if (input.interactedAt) update.lastInteractionAt = input.interactedAt;
  return prisma.contact.upsert({
    where: { channelId_externalId: { channelId: channel.id, externalId: input.externalId } },
    create: {
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      platform: channel.platform,
      externalId: input.externalId,
      username: input.username,
      name: input.name,
      avatarUrl: input.avatarUrl,
      lastInteractionAt: input.interactedAt,
    },
    update,
  });
}

export async function touchConversation(
  channel: Channel,
  contact: Contact,
  opts: { inboundAt?: Date; lastMessageAt: Date; preview?: string; incrementUnread?: boolean },
): Promise<Conversation> {
  const preview = opts.preview?.slice(0, 200);
  return prisma.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
    create: {
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      contactId: contact.id,
      lastInboundAt: opts.inboundAt,
      lastMessageAt: opts.lastMessageAt,
      lastMessagePreview: preview,
      unreadCount: opts.incrementUnread ? 1 : 0,
    },
    update: {
      ...(opts.inboundAt ? { lastInboundAt: opts.inboundAt, status: ConversationStatus.OPEN } : {}),
      lastMessageAt: opts.lastMessageAt,
      lastMessagePreview: preview,
      ...(opts.incrementUnread ? { unreadCount: { increment: 1 } } : {}),
    },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    return { unserializable: true };
  }
}

/** Idempotent on Meta's `mid`. Returns false when the message already existed. */
export async function recordMessage(
  conversationId: string,
  input: { direction: MessageDirection; externalId?: string; text?: string; payload?: unknown; automationId?: string; createdAt?: Date },
): Promise<boolean> {
  if (input.externalId) {
    const existing = await prisma.message.findUnique({ where: { externalId: input.externalId }, select: { id: true } });
    if (existing) return false;
  }
  try {
    await prisma.message.create({
      data: {
        conversationId,
        direction: input.direction,
        externalId: input.externalId,
        text: input.text ?? null,
        payload: input.payload === undefined ? undefined : toJson(input.payload),
        automationId: input.automationId,
        createdAt: input.createdAt,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

// ───────────────────────── Starting flows ─────────────────────────

export type StartFlowInput = {
  automation: Automation;
  channel: Channel;
  contact: Contact;
  context: FlowSessionContext;
  viaPrivateReplyCommentId?: string;
  /** Idempotency key for the first EXECUTE_FLOW job; defaults to the trigger's comment/message id. */
  dedupeKey?: string;
};

export type StartFlowResult = { started: boolean; sessionId?: string; reason?: "empty_flow" | "invalid_flow" | "once_per_contact" | "duplicate" };

export async function startFlowForContact(input: StartFlowInput): Promise<StartFlowResult> {
  const { automation, channel, contact } = input;
  const flow = parseFlow(automation.flow);
  if (!flow) {
    logger.error("flow.invalid_graph", { automationId: automation.id });
    return { started: false, reason: "invalid_flow" };
  }
  const firstNodeId = firstNodeAfterTrigger(flow);
  if (!firstNodeId) return { started: false, reason: "empty_flow" };

  const triggerRef = input.context.commentId ?? input.context.messageId ?? contact.id;
  const dedupeKey = input.dedupeKey ?? `flow:${automation.id}:${triggerRef}`;
  const existingJob = await prisma.job.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existingJob) return { started: false, reason: "duplicate" };

  if (automation.oncePerContact) {
    // "Once" means one successful delivery or one in-flight session: a failed attempt may be retried by a new trigger.
    const [sent, active] = await Promise.all([
      prisma.deliveryLog.findFirst({ where: { automationId: automation.id, contactId: contact.id, status: DeliveryStatus.SENT }, select: { id: true } }),
      prisma.flowSession.findFirst({ where: { automationId: automation.id, contactId: contact.id, status: FlowSessionStatus.ACTIVE }, select: { id: true } }),
    ]);
    if (sent || active) return { started: false, reason: "once_per_contact" };
  } else {
    // A re-trigger supersedes any older session of the same automation for this contact.
    await prisma.flowSession.updateMany({
      where: { automationId: automation.id, contactId: contact.id, status: FlowSessionStatus.ACTIVE },
      data: { status: FlowSessionStatus.EXPIRED },
    });
  }

  const session = await prisma.flowSession.create({
    data: {
      workspaceId: channel.workspaceId,
      automationId: automation.id,
      contactId: contact.id,
      currentNodeId: null,
      context: contextJson({ ...input.context, vars: { ...contactTemplateVars(contact), ...(input.context.vars ?? {}) } }),
    },
  });

  const job = await enqueue({
    type: JobType.EXECUTE_FLOW,
    workspaceId: channel.workspaceId,
    payload: { sessionId: session.id, nodeId: firstNodeId, fromNodeId: null, viaPrivateReplyCommentId: input.viaPrivateReplyCommentId },
    dedupeKey,
  });
  if (!job) {
    // Lost the race with a concurrent delivery of the same event.
    await prisma.flowSession.update({ where: { id: session.id }, data: { status: FlowSessionStatus.EXPIRED } });
    return { started: false, reason: "duplicate" };
  }

  await prisma.automation.update({ where: { id: automation.id }, data: { triggeredCount: { increment: 1 }, lastTriggeredAt: new Date() } });
  logger.info("flow.started", { automationId: automation.id, sessionId: session.id, contactId: contact.id, viaPrivateReply: Boolean(input.viaPrivateReplyCommentId) });
  return { started: true, sessionId: session.id };
}

// ───────────────────────── Incoming events ─────────────────────────

async function handleCommentEvent(channel: Channel, event: NormalizedCommentEvent): Promise<void> {
  // The account replying to its own post must never trigger a DM to itself.
  if (event.from.id && event.from.id === channel.externalId) return;

  const automations = await findMatchingAutomations(channel.id, TriggerType.COMMENT, event.text, event.mediaId);
  if (automations.length === 0) return;

  // Facebook may omit `from` for users who never authorized the app; a synthetic id still lets private replies work.
  const externalId = event.from.id || `anon:${event.commentId}`;
  const contact = await upsertContact(channel, { externalId, username: event.from.username, interactedAt: event.timestamp });

  for (const automation of automations) {
    if (automation.workspaceId !== channel.workspaceId) continue;
    const seen = await prisma.deliveryLog.findFirst({ where: { automationId: automation.id, commentExternalId: event.commentId }, select: { id: true } });
    if (seen) continue;

    const result = await startFlowForContact({
      automation,
      channel,
      contact,
      context: {
        commentId: event.commentId,
        mediaId: event.mediaId,
        parentCommentId: event.parentCommentId,
        triggerText: event.text,
        vars: event.from.username ? { username: `@${event.from.username}`, name: event.from.username, first_name: event.from.username } : undefined,
      },
      viaPrivateReplyCommentId: event.commentId,
      dedupeKey: `flow:${automation.id}:${event.commentId}`,
    });

    if (!result.started) {
      if (result.reason === "once_per_contact") {
        await recordDeliveryLog({
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          automationId: automation.id,
          contactId: contact.id,
          kind: DeliveryKind.PRIVATE_REPLY,
          status: DeliveryStatus.SKIPPED_DUPLICATE,
          commentExternalId: event.commentId,
          recipientExternalId: contact.externalId,
          recipientUsername: contact.username,
          errorMessage: "Already sent to this contact (once per contact)",
        });
      }
      continue;
    }

    if (automation.publicReplyEnabled && automation.publicReplies.length > 0) {
      await enqueue({
        type: JobType.PUBLIC_REPLY,
        workspaceId: channel.workspaceId,
        payload: { automationId: automation.id, channelId: channel.id, commentId: event.commentId, contactId: contact.id },
        dedupeKey: `pr:${automation.id}:${event.commentId}`,
        maxAttempts: 3,
      });
    }
  }
}

function inboundPreview(event: NormalizedMessageEvent): string {
  if (event.text?.trim()) return event.text.trim();
  if (event.storyReply) return "[story reply]";
  if (event.attachments?.length) return "[attachment]";
  return "";
}

/** How the account refers to itself in a prompt: the handle if it has one, else the name. */
function accountHandleFor(channel: Channel): string {
  const username = channel.username?.trim();
  if (username) return `@${username.replace(/^@/, "")}`;
  return channel.name?.trim() || "this account";
}

/** What an attachment was, in words: the model cannot see it, but it should know something was sent. */
function attachmentLabel(attachment: unknown): string {
  const type = isRecord(attachment) && typeof attachment.type === "string" ? attachment.type : "";
  switch (type) {
    case "image":
      return "sent a photo";
    case "video":
      return "sent a video";
    case "audio":
      return "sent a voice message";
    case "file":
      return "sent a file";
    case "share":
    case "ig_reel":
    case "reel":
      return "shared a post";
    case "story_mention":
      return "mentioned you in their story";
    default:
      return "sent an attachment";
  }
}

/** A message from the contact as the AI reads it: their words, plus what else came with them. */
function inboundTurnText(text: string | null, payload: Prisma.JsonValue | null): string {
  const data = isRecord(payload) ? payload : {};
  const parts: string[] = [];
  if (isRecord(data.storyReply)) parts.push("[replying to your story]");
  if (Array.isArray(data.attachments)) for (const a of data.attachments.slice(0, 3)) parts.push(`[${attachmentLabel(a)}]`);
  const words = text?.trim();
  if (words) parts.push(words);
  return parts.join(" ");
}

type ConversationForAi = {
  history: ChatTurn[];
  /** When the contact's newest message was sent; null when they have not written. */
  newestInboundAt: Date | null;
};

/**
 * The conversation so far, oldest first, as chat turns.
 *
 * Read straight from the messages we already store, so an agent picking up a
 * thread mid-way sees what the contact and the account have actually said,
 * including anything a human typed from the Inbox and the messages earlier
 * steps sent. A photo or a story reply becomes a short note instead of
 * vanishing. A comment is not a conversation message, so the one that started
 * a comment session is put back in where it happened.
 */
async function conversationForAi(run: SessionRun, limit: number): Promise<ConversationForAi> {
  const conversation = await prisma.conversation.findUnique({
    where: { channelId_contactId: { channelId: run.channel.id, contactId: run.contact.id } },
    select: { id: true },
  });
  const [rows, newest] = conversation
    ? await Promise.all([
        prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "desc" },
          take: Math.max(2, Math.min(limit, 50)),
          select: { direction: true, text: true, payload: true, createdAt: true },
        }),
        prisma.message.findFirst({
          where: { conversationId: conversation.id, direction: MessageDirection.INBOUND },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ])
    : [[], null];

  const turns = rows
    .reverse()
    .map((row) => ({
      at: row.createdAt,
      role: row.direction === MessageDirection.INBOUND ? ("user" as const) : ("assistant" as const),
      // Our own image-only sends have no words worth repeating back to the model.
      content: row.direction === MessageDirection.INBOUND ? inboundTurnText(row.text, row.payload) : (row.text ?? "").trim(),
    }))
    .filter((t) => t.content.length > 0);

  const comment = run.context.commentId ? run.context.triggerText?.trim() : undefined;
  if (comment) {
    const startedAt = run.session.createdAt;
    const after = turns.findIndex((t) => t.at > startedAt);
    turns.splice(after === -1 ? turns.length : after, 0, { at: startedAt, role: "user", content: `[commented on your post] ${comment}` });
  }

  return { history: turns.map(({ role, content }) => ({ role, content })), newestInboundAt: newest?.createdAt ?? null };
}

/** Saved answers and custom fields, as the AI should read them. Values that are not plain text or numbers are left out. */
function contactFacts(contact: Contact): Array<{ label: string; value: string }> {
  if (!isRecord(contact.customFields)) return [];
  const facts: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(contact.customFields)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value).trim();
    if (text) facts.push({ label: key.replace(/_/g, " "), value: text.slice(0, 200) });
    if (facts.length >= 12) break;
  }
  return facts;
}

function aiBusyFor(context: FlowSessionContext, messageId: string | null): boolean {
  const busy = context.aiBusy;
  if (!busy || busy.messageId === messageId) return false;
  const at = Date.parse(busy.at);
  return Number.isFinite(at) && Date.now() - at < AI_BUSY_MS;
}

type ActiveSessionWithFlow = FlowSession & { automation: Automation };

async function activeSessions(channel: Channel, contact: Contact): Promise<ActiveSessionWithFlow[]> {
  return prisma.flowSession.findMany({
    where: { workspaceId: channel.workspaceId, contactId: contact.id, status: FlowSessionStatus.ACTIVE },
    include: { automation: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
}

type AskQuestionData = Extract<FlowNodeData, { type: "ask_question" }>;

/** The node a session is waiting on for an answer, or null. A stale `awaiting` left after the session moved on is ignored. */
function awaitingNodeId(session: FlowSession): string | null {
  const awaiting = readSessionContext(session.context).awaiting;
  return awaiting && session.currentNodeId === awaiting.nodeId ? awaiting.nodeId : null;
}

/** A quick-reply tap answers with the option's title (Meta also echoes it as text); anything else answers with the message text. */
function answerTextFor(data: AskQuestionData, nodeId: string, event: NormalizedMessageEvent): string {
  const match = event.quickReplyPayload ? /^qr:(.+):(\d+)$/.exec(event.quickReplyPayload) : null;
  if (match && match[1] === nodeId) {
    const title = data.prompt.quickReplies?.[Number(match[2])]?.title;
    if (title) return title;
  }
  return (event.text ?? "").slice(0, 4000);
}

/** The session whose AI step is talking with this contact: parked for their reply, or writing one. */
function aiListener(sessions: ActiveSessionWithFlow[]): { session: ActiveSessionWithFlow; nodeId: string } | null {
  for (const session of sessions) {
    if (session.automation.status !== AutomationStatus.ACTIVE || !session.currentNodeId) continue;
    const flow = parseFlow(session.automation.flow);
    if (flow && getNode(flow, session.currentNodeId)?.data.type === "ai_reply") return { session, nodeId: session.currentNodeId };
  }
  return null;
}

/**
 * Hands the contact's message to the AI step talking with them. Held back a
 * moment so a few messages sent in a row are answered together; the step
 * itself skips every one but the newest.
 */
async function queueAiTurn(channel: Channel, listener: { session: ActiveSessionWithFlow; nodeId: string }, answer: FlowAnswer): Promise<void> {
  await enqueue({
    type: JobType.EXECUTE_FLOW,
    workspaceId: channel.workspaceId,
    payload: { sessionId: listener.session.id, nodeId: listener.nodeId, fromNodeId: listener.nodeId, answer },
    runAt: new Date(Date.now() + AI_QUIET_MS),
    dedupeKey: `flow:${listener.session.id}:${listener.nodeId}:answer:${answer.messageId}`,
  });
}

/** Queue the next step for a parked session. Returns false when nothing is wired to that handle. */
async function resumeSession(channel: Channel, session: ActiveSessionWithFlow, fromNodeId: string, handle: string, dedupeSuffix: string): Promise<boolean> {
  const flow = parseFlow(session.automation.flow);
  if (!flow) return false;
  const next = nextNodeId(flow, fromNodeId, handle);
  if (!next) return false;
  await enqueue({
    type: JobType.EXECUTE_FLOW,
    workspaceId: channel.workspaceId,
    payload: { sessionId: session.id, nodeId: next, fromNodeId },
    dedupeKey: `flow:${session.id}:${fromNodeId}:${handle}:${dedupeSuffix}`,
  });
  return true;
}

async function handleMessageEvent(channel: Channel, event: NormalizedMessageEvent): Promise<void> {
  if (event.isEcho) {
    // Sent by the account (our API call or a human in the IG/FB app). Our own sends already stored the mid.
    if (event.recipientId === channel.externalId) return;
    const contact = await upsertContact(channel, { externalId: event.recipientId });
    const conversation = await touchConversation(channel, contact, { lastMessageAt: event.timestamp, preview: inboundPreview(event) });
    await recordMessage(conversation.id, {
      direction: MessageDirection.OUTBOUND,
      externalId: event.messageId,
      text: event.text,
      payload: { attachments: event.attachments ?? null, echo: true },
      createdAt: event.timestamp,
    });
    return;
  }

  const contact = await upsertContact(channel, { externalId: event.senderId, interactedAt: event.timestamp });
  const conversation = await touchConversation(channel, contact, {
    inboundAt: event.timestamp,
    lastMessageAt: event.timestamp,
    preview: inboundPreview(event),
    incrementUnread: true,
  });
  const created = await recordMessage(conversation.id, {
    direction: MessageDirection.INBOUND,
    externalId: event.messageId,
    text: event.text,
    payload: { attachments: event.attachments ?? null, storyReply: event.storyReply ?? null, quickReplyPayload: event.quickReplyPayload ?? null },
    createdAt: event.timestamp,
  });
  if (!created) return; // redelivered webhook: never re-trigger

  const sessions = await activeSessions(channel, contact);

  // A question waiting for its answer, or an AI step in a conversation, takes this message: ahead of
  // quick-reply routing and keyword triggers, so a reply like "link@example.com" never also starts a "link" automation.
  for (const session of sessions) {
    if (session.automation.status !== AutomationStatus.ACTIVE || !session.currentNodeId) continue;
    const flow = parseFlow(session.automation.flow);
    const node = flow ? getNode(flow, session.currentNodeId) : undefined;
    if (node?.data.type === "ask_question" && awaitingNodeId(session) === node.id) {
      const answer: FlowAnswer = { text: answerTextFor(node.data, node.id, event), messageId: event.messageId };
      await enqueue({
        type: JobType.EXECUTE_FLOW,
        workspaceId: channel.workspaceId,
        payload: { sessionId: session.id, nodeId: node.id, fromNodeId: node.id, answer },
        dedupeKey: `flow:${session.id}:${node.id}:answer:${event.messageId}`,
      });
      return;
    }
    if (node?.data.type === "ai_reply") {
      await queueAiTurn(channel, { session, nodeId: node.id }, { text: (event.text ?? "").slice(0, 4000), messageId: event.messageId, at: event.timestamp.toISOString() });
      return;
    }
  }

  if (event.quickReplyPayload) {
    const match = /^qr:(.+):(\d+)$/.exec(event.quickReplyPayload);
    if (match) {
      const [, nodeId, index] = match;
      const session = sessions.find((s) => s.currentNodeId === nodeId);
      if (session && (await resumeSession(channel, session, nodeId, `qr:${index}`, event.messageId))) return;
    }
  }

  // A session parked on a message node with a "next" edge is waiting for exactly this reply.
  for (const session of sessions) {
    if (!session.currentNodeId) continue;
    const flow = parseFlow(session.automation.flow);
    if (!flow) continue;
    const node = getNode(flow, session.currentNodeId);
    if (node?.data.type !== "send_message") continue;
    if (await resumeSession(channel, session, session.currentNodeId, "next", event.messageId)) return;
  }

  const trigger = event.storyReply ? TriggerType.STORY_REPLY : TriggerType.DM;
  const text = event.text ?? "";
  const automations = await findMatchingAutomations(channel.id, trigger, text);
  for (const automation of automations) {
    if (automation.workspaceId !== channel.workspaceId) continue;
    const result = await startFlowForContact({
      automation,
      channel,
      contact,
      context: { messageId: event.messageId, storyId: event.storyReply?.storyId, triggerText: text },
      dedupeKey: `flow:${automation.id}:${event.messageId}`,
    });
    if (!result.started && result.reason === "once_per_contact") {
      await recordDeliveryLog({
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        automationId: automation.id,
        contactId: contact.id,
        kind: DeliveryKind.MESSAGE,
        status: DeliveryStatus.SKIPPED_DUPLICATE,
        recipientExternalId: contact.externalId,
        recipientUsername: contact.username,
        errorMessage: "Already sent to this contact (once per contact)",
      });
    }
  }
}

async function handlePostbackEvent(channel: Channel, event: NormalizedPostbackEvent): Promise<void> {
  const contact = await upsertContact(channel, { externalId: event.senderId, interactedAt: event.timestamp });
  // A button tap is a standard interaction: it (re)opens the 24h window.
  const conversation = await touchConversation(channel, contact, {
    inboundAt: event.timestamp,
    lastMessageAt: event.timestamp,
    preview: event.title ?? event.payload,
    incrementUnread: true,
  });
  const created = await recordMessage(conversation.id, {
    direction: MessageDirection.INBOUND,
    externalId: event.postbackId,
    text: event.title,
    payload: { postback: event.payload, title: event.title ?? null },
    createdAt: event.timestamp,
  });
  if (!created) return;

  const suffix = event.postbackId ?? String(event.timestamp.getTime());
  const sessions = await activeSessions(channel, contact);

  // A button from an earlier message, tapped while an AI step is talking with them, is something they said: the AI answers it.
  const toAi = async (): Promise<boolean> => {
    const listener = aiListener(sessions);
    if (!listener || !event.title?.trim()) return false;
    await queueAiTurn(channel, listener, { text: event.title.slice(0, 4000), messageId: `postback:${suffix}`, at: event.timestamp.toISOString() });
    return true;
  };

  const button = /^btn:(.+):(\d+)$/.exec(event.payload);
  if (button) {
    const [, nodeId, index] = button;
    const session = sessions.find((s) => s.currentNodeId === nodeId);
    if (!session) {
      if (await toAi()) return;
      logger.info("flow.postback_no_session", { contactId: contact.id, nodeId });
      return;
    }
    await resumeSession(channel, session, nodeId, `btn:${index}`, suffix);
    return;
  }

  const followCheck = /^follow_check:(.+)$/.exec(event.payload);
  if (followCheck) {
    const [, nodeId] = followCheck;
    // The session may be parked on the condition itself or on the "no"-branch message that carried the button.
    const session = sessions.find((s) => {
      const flow = parseFlow(s.automation.flow);
      return flow ? getNode(flow, nodeId)?.data.type === "condition_follow" : false;
    });
    if (!session) {
      logger.info("flow.follow_check_no_session", { contactId: contact.id, nodeId });
      return;
    }
    await enqueue({
      type: JobType.EXECUTE_FLOW,
      workspaceId: channel.workspaceId,
      payload: { sessionId: session.id, nodeId, fromNodeId: session.currentNodeId },
      dedupeKey: `flow:${session.id}:${nodeId}:check:${suffix}`,
    });
    return;
  }

  if (await toAi()) return;
  logger.info("flow.postback_unhandled", { contactId: contact.id, payload: event.payload.slice(0, 64) });
}

export async function handleIncomingEvent(channel: Channel, event: NormalizedEvent): Promise<void> {
  if (event.platform !== channel.platform) {
    logger.warn("engine.platform_mismatch", { channelId: channel.id, eventPlatform: event.platform });
    return;
  }
  switch (event.kind) {
    case "comment":
      return handleCommentEvent(channel, event);
    case "message":
      return handleMessageEvent(channel, event);
    case "postback":
      return handlePostbackEvent(channel, event);
    default:
      return;
  }
}

// ───────────────────────── Executing steps ─────────────────────────

type SessionRun = {
  session: FlowSession;
  automation: Automation;
  channel: Channel;
  contact: Contact;
  flow: FlowGraph;
  context: FlowSessionContext;
};

async function setSession(sessionId: string, data: { currentNodeId?: string | null; status?: FlowSessionStatus; context?: FlowSessionContext }): Promise<void> {
  await prisma.flowSession.update({
    where: { id: sessionId },
    data: {
      ...(data.currentNodeId !== undefined ? { currentNodeId: data.currentNodeId } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.context ? { context: contextJson(data.context) } : {}),
    },
  });
}

function templateVars(contact: Contact, context: FlowSessionContext): Record<string, string | undefined> {
  const fromContact = contactTemplateVars(contact);
  const merged: Record<string, string | undefined> = { ...(context.vars ?? {}) };
  for (const [key, value] of Object.entries(fromContact)) if (value) merged[key] = value;
  return merged;
}

function defaultRetryPrompt(channel: Channel): string {
  const handle = channel.username ? `@${channel.username.replace(/^@/, "")}` : "us";
  return `It looks like you're not following ${handle} yet. Follow, then tap the button below to continue.`;
}

/**
 * Instagram only: refresh `isFollower` whenever it is unknown or false so a
 * user who just followed passes the gate. Facebook has no follow concept for
 * Messenger users, so FB channels always take the "yes" branch.
 */
async function resolveFollowStatus(channel: Channel, contact: Contact): Promise<{ contact: Contact; isFollower: boolean } | "token_error"> {
  if (channel.platform === ChannelPlatform.FACEBOOK) return { contact, isFollower: true };
  if (contact.isFollower === true) return { contact, isFollower: true };
  try {
    const profile = await getInstagramUserProfile(getChannelToken(channel), channel.externalId, contact.externalId);
    if (profile.isFollower === undefined) return { contact, isFollower: false };
    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        isFollower: profile.isFollower,
        username: profile.username ?? undefined,
        name: profile.name ?? undefined,
        avatarUrl: profile.profilePic ?? undefined,
      },
    });
    return { contact: updated, isFollower: profile.isFollower };
  } catch (err) {
    if (err instanceof MetaTokenError) {
      await markChannelTokenExpired(channel.id, err.message);
      return "token_error";
    }
    if (err instanceof MetaApiError && err.retryable) throw err;
    // Profile lookups fail for users who never messaged the account: treat as "not verified" without persisting.
    logger.warn("flow.follow_check_failed", { channelId: channel.id, contactId: contact.id, error: err instanceof Error ? err.message : String(err) });
    return { contact, isFollower: false };
  }
}

/** "name" updates the contact's display name; every other key lands in customFields (merged, so other fields survive). */
async function saveAnswer(contact: Contact, saveTo: string, value: string | number): Promise<Contact> {
  if (saveTo === "name") {
    return prisma.contact.update({ where: { id: contact.id }, data: { name: String(value).slice(0, 120) } });
  }
  const current = isRecord(contact.customFields) ? contact.customFields : {};
  return prisma.contact.update({ where: { id: contact.id }, data: { customFields: toJson({ ...current, [saveTo]: value }) } });
}

async function updateTags(contact: Contact, tag: string, add: boolean): Promise<Contact> {
  const clean = tag.trim();
  if (!clean) return contact;
  const has = contact.tags.includes(clean);
  if (add === has) return contact;
  const tags = add ? [...contact.tags, clean] : contact.tags.filter((t) => t !== clean);
  return prisma.contact.update({ where: { id: contact.id }, data: { tags: { set: tags } } });
}

/**
 * Pipeline steps never stop a flow: a pipeline or stage deleted after the
 * automation went live is logged and skipped, and the flow carries on.
 */
async function applyPipelineStep(run: SessionRun, data: Extract<FlowNodeData, { type: "add_to_pipeline" | "move_stage" | "remove_from_pipeline" }>): Promise<void> {
  const workspaceId = run.channel.workspaceId;
  const source = { automationId: run.automation.id };
  try {
    if (data.type === "remove_from_pipeline") {
      await removeContactsFromPipeline(workspaceId, [run.contact.id], data.pipelineId, source);
    } else {
      await setContactsStage(workspaceId, [run.contact.id], data.pipelineId, data.stageId, source, { onlyIfAbsent: data.type === "add_to_pipeline" });
    }
  } catch (err) {
    logger.warn("flow.pipeline_step_skipped", { automationId: run.automation.id, sessionId: run.session.id, step: data.type, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * After a send that could not go out because of throttling: retry later
 * (up to 6h from session start), otherwise give up with SKIPPED_RATE_LIMIT.
 */
async function deferForRateLimit(
  run: SessionRun,
  nodeId: string,
  result: SendToContactResult,
  viaPrivateReplyCommentId?: string,
  answer?: FlowAnswer,
): Promise<void> {
  const now = Date.now();
  const retries = (run.context.rateLimitRetries ?? 0) + 1;
  const ageMs = now - run.session.createdAt.getTime();
  if (ageMs < RATE_LIMIT_MAX_DEFER_MS) {
    const base = result.retryAt && result.retryAt.getTime() > now ? result.retryAt.getTime() : now + 60_000;
    const runAt = new Date(base + Math.floor(Math.random() * 15_000));
    await setSession(run.session.id, { currentNodeId: nodeId, context: { ...run.context, rateLimitRetries: retries } });
    await enqueue({
      type: JobType.EXECUTE_FLOW,
      workspaceId: run.channel.workspaceId,
      payload: { sessionId: run.session.id, nodeId, viaPrivateReplyCommentId, answer },
      runAt,
      dedupeKey: `flow:${run.session.id}:${nodeId}:rl:${retries}`,
    });
    logger.info("flow.deferred_rate_limit", { sessionId: run.session.id, nodeId, retries, runAt: runAt.toISOString() });
    return;
  }
  await recordDeliveryLog({
    workspaceId: run.channel.workspaceId,
    channelId: run.channel.id,
    automationId: run.automation.id,
    contactId: run.contact.id,
    kind: viaPrivateReplyCommentId ? DeliveryKind.PRIVATE_REPLY : DeliveryKind.MESSAGE,
    status: DeliveryStatus.SKIPPED_RATE_LIMIT,
    commentExternalId: viaPrivateReplyCommentId,
    recipientExternalId: run.contact.externalId,
    recipientUsername: run.contact.username,
    errorMessage: `Rate limited for ${Math.round(ageMs / 3_600_000)}h, giving up`,
  });
  await setSession(run.session.id, { currentNodeId: nodeId, status: FlowSessionStatus.EXPIRED, context: { ...run.context, lastError: "rate_limit" } });
}

export async function executeFlowStep(job: Job): Promise<void> {
  const parsed = executeFlowPayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    logger.error("flow.bad_payload", { jobId: job.id, issues: parsed.error.issues });
    return;
  }
  const payload = parsed.data;

  const session = await prisma.flowSession.findUnique({
    where: { id: payload.sessionId },
    include: { automation: { include: { channel: true } }, contact: true },
  });
  if (!session || session.status !== FlowSessionStatus.ACTIVE) return;

  const { automation } = session;
  const channel = automation.channel;
  const context = readSessionContext(session.context);

  if (automation.status !== AutomationStatus.ACTIVE || channel.status === ChannelStatus.DISCONNECTED) {
    await setSession(session.id, { status: FlowSessionStatus.EXPIRED, context: { ...context, lastError: "automation_or_channel_inactive" } });
    return;
  }
  const flow = parseFlow(automation.flow);
  if (!flow) {
    await setSession(session.id, { status: FlowSessionStatus.EXPIRED, context: { ...context, lastError: "invalid_flow" } });
    logger.error("flow.invalid_graph", { automationId: automation.id, sessionId: session.id });
    return;
  }

  // Atomic transition: only one job may move the session off `fromNodeId`.
  if (payload.fromNodeId !== undefined) {
    const moved = await prisma.flowSession.updateMany({
      where: { id: session.id, status: FlowSessionStatus.ACTIVE, currentNodeId: payload.fromNodeId },
      data: { currentNodeId: payload.nodeId },
    });
    if (moved.count === 0) {
      logger.info("flow.stale_step", { sessionId: session.id, fromNodeId: payload.fromNodeId, currentNodeId: session.currentNodeId });
      return;
    }
  } else {
    await setSession(session.id, { currentNodeId: payload.nodeId });
  }

  const run: SessionRun = { session, automation, channel, contact: session.contact, flow, context };
  let nodeId: string | null = payload.nodeId;
  let viaPrivateReply = payload.viaPrivateReplyCommentId;
  // Consumed by the question it answers; a second question reached on the same run asks afresh.
  let answer = payload.answer;

  for (let steps = 0; nodeId !== null && steps < MAX_STEPS_PER_RUN; steps++) {
    const node = getNode(flow, nodeId);
    if (!node) break;

    switch (node.data.type) {
      case "trigger": {
        nodeId = nextNodeId(flow, node.id, "next");
        continue;
      }

      case "add_tag":
      case "remove_tag": {
        run.contact = await updateTags(run.contact, node.data.tag, node.data.type === "add_tag");
        nodeId = nextNodeId(flow, node.id, "next");
        continue;
      }

      case "add_to_pipeline":
      case "move_stage":
      case "remove_from_pipeline": {
        await applyPipelineStep(run, node.data);
        nodeId = nextNodeId(flow, node.id, "next");
        continue;
      }

      case "delay": {
        const next = nextNodeId(flow, node.id, "next");
        if (!next) {
          nodeId = null;
          continue;
        }
        await setSession(session.id, { currentNodeId: node.id, context: run.context });
        await enqueue({
          type: JobType.EXECUTE_FLOW,
          workspaceId: channel.workspaceId,
          payload: { sessionId: session.id, nodeId: next, fromNodeId: node.id, viaPrivateReplyCommentId: viaPrivateReply },
          runAt: new Date(Date.now() + node.data.seconds * 1000),
          dedupeKey: `flow:${session.id}:${node.id}:delay:${Date.now()}`,
        });
        return;
      }

      case "send_message": {
        const message = attachPostbackPayloads(node.id, node.data.message);
        const result = await sendToContact({
          channel,
          contact: run.contact,
          message,
          vars: templateVars(run.contact, run.context),
          automationId: automation.id,
          viaPrivateReplyCommentId: viaPrivateReply,
        });
        if (result.retryable) {
          await deferForRateLimit(run, node.id, result, viaPrivateReply);
          return;
        }
        // The private reply is spent on the first attempt of a comment session, whatever the outcome.
        viaPrivateReply = undefined;
        if (result.status !== DeliveryStatus.SENT) {
          await setSession(session.id, { currentNodeId: node.id, status: FlowSessionStatus.EXPIRED, context: { ...run.context, lastError: result.error } });
          return;
        }
        if (outgoingEdges(flow, node.id).length === 0) {
          nodeId = null;
          continue;
        }
        // Pause: the flow resumes when the contact taps a button or replies.
        await setSession(session.id, { currentNodeId: node.id, context: run.context });
        return;
      }

      case "ask_question": {
        const awaiting = run.context.awaiting;
        if (answer && awaiting?.nodeId === node.id) {
          const pending = answer;
          answer = undefined;
          const value = validateAnswer(pending.text, node.data.validation ?? "none");
          if (value !== null) {
            run.contact = await saveAnswer(run.contact, node.data.saveTo, value);
            run.context = { ...run.context, awaiting: undefined, vars: { ...(run.context.vars ?? {}), [node.data.saveTo]: String(value) } };
            logger.info("flow.answer_saved", { sessionId: session.id, nodeId: node.id, contactId: run.contact.id, saveTo: node.data.saveTo });
            nodeId = nextNodeId(flow, node.id, "next");
            continue;
          }
          const attempts = awaiting.attempts + 1;
          if (attempts > (node.data.maxRetries ?? DEFAULT_ASK_RETRIES)) {
            // Out of retries: carry on without saving so the rest of the flow still runs.
            run.context = { ...run.context, awaiting: undefined };
            logger.info("flow.answer_gave_up", { sessionId: session.id, nodeId: node.id, contactId: run.contact.id, attempts: awaiting.attempts });
            nodeId = nextNodeId(flow, node.id, "next");
            continue;
          }
          // Re-ask with the same suggestions; the contact just messaged, so the 24h window is open.
          const retry = attachPostbackPayloads(node.id, {
            text: node.data.retryPrompt?.trim() || DEFAULT_ASK_RETRY_PROMPT,
            quickReplies: node.data.prompt.quickReplies,
          });
          const result = await sendToContact({ channel, contact: run.contact, message: retry, vars: templateVars(run.contact, run.context), automationId: automation.id });
          if (result.retryable) {
            await deferForRateLimit(run, node.id, result, undefined, pending);
            return;
          }
          if (result.status !== DeliveryStatus.SENT) {
            await setSession(session.id, { currentNodeId: node.id, status: FlowSessionStatus.EXPIRED, context: { ...run.context, lastError: result.error } });
            return;
          }
          await setSession(session.id, { currentNodeId: node.id, context: { ...run.context, awaiting: { nodeId: node.id, attempts } } });
          return;
        }

        // Fresh visit: ask, then park until the contact's next message comes back as `payload.answer`.
        const message = attachPostbackPayloads(node.id, node.data.prompt);
        const result = await sendToContact({
          channel,
          contact: run.contact,
          message,
          vars: templateVars(run.contact, run.context),
          automationId: automation.id,
          viaPrivateReplyCommentId: viaPrivateReply,
        });
        if (result.retryable) {
          await deferForRateLimit(run, node.id, result, viaPrivateReply);
          return;
        }
        viaPrivateReply = undefined;
        if (result.status !== DeliveryStatus.SENT) {
          await setSession(session.id, { currentNodeId: node.id, status: FlowSessionStatus.EXPIRED, context: { ...run.context, lastError: result.error } });
          return;
        }
        await setSession(session.id, { currentNodeId: node.id, context: { ...run.context, awaiting: { nodeId: node.id, attempts: 0 } } });
        return;
      }

      case "ai_reply": {
        const data = node.data;
        const maxTurns = data.maxTurns ?? DEFAULT_AI_TURNS;
        // The contact's message this job was queued for. Only the step it was queued for may use it.
        const pending = answer && node.id === payload.nodeId ? answer : undefined;
        answer = undefined;
        const parked = run.context.awaiting?.nodeId === node.id ? run.context.awaiting : undefined;

        if (pending) {
          // A reply is still being written, or this step has not sent its first one yet:
          // wait for it, so this message is answered with that reply in view.
          if (aiBusyFor(run.context, pending.messageId) || !parked) {
            const waits = payload.aiWaits ?? 0;
            if (waits >= AI_MAX_WAITS) {
              logger.warn("flow.ai_turn_gave_up", { sessionId: session.id, nodeId: node.id, messageId: pending.messageId });
              return;
            }
            await enqueue({
              type: JobType.EXECUTE_FLOW,
              workspaceId: channel.workspaceId,
              payload: { sessionId: session.id, nodeId: node.id, fromNodeId: node.id, answer: pending, aiWaits: waits + 1 },
              runAt: new Date(Date.now() + AI_WAIT_STEP_MS),
              dedupeKey: `flow:${session.id}:${node.id}:answer:${pending.messageId}:wait:${waits + 1}`,
            });
            return;
          }
          // Out of turns: the flow carries on without another model call.
          if (parked.attempts >= maxTurns) {
            run.context = { ...run.context, awaiting: undefined };
            nodeId = nextNodeId(flow, node.id, "next");
            continue;
          }
        }

        const agent = await resolveAgent(channel.workspaceId, data.agentId);
        if (!agent) {
          // Nothing configured: say nothing rather than something wrong, and
          // let the handover branch (or the rest of the flow) take over.
          logger.warn("flow.ai_no_agent", { sessionId: session.id, nodeId: node.id, agentId: data.agentId });
          run.context = { ...run.context, awaiting: undefined, lastError: "ai_no_agent" };
          nodeId = nextNodeId(flow, node.id, "handoff") ?? nextNodeId(flow, node.id, "next");
          continue;
        }

        const { history, newestInboundAt } = await conversationForAi(run, agent.historyLimit);
        if (pending) {
          const sentAt = pending.at ? Date.parse(pending.at) : NaN;
          // They wrote again since: that message's turn answers both, a moment later.
          if (newestInboundAt && Number.isFinite(sentAt) && newestInboundAt.getTime() > sentAt) return;
          // An earlier reply already had this message in view.
          const answeredAt = run.context.aiAnsweredAt ? Date.parse(run.context.aiAnsweredAt) : NaN;
          const latestAt = newestInboundAt?.getTime() ?? sentAt;
          if (Number.isFinite(answeredAt) && Number.isFinite(latestAt) && latestAt <= answeredAt) return;
        }

        const turnsUsed = pending ? (parked?.attempts ?? 0) : 0;
        await setSession(session.id, {
          currentNodeId: node.id,
          context: { ...run.context, aiBusy: { at: new Date().toISOString(), messageId: pending?.messageId ?? null } },
        });

        const outcome = await runAgent({
          workspaceId: channel.workspaceId,
          agent: withStepInstruction(agent, data.instruction),
          context: {
            accountHandle: accountHandleFor(channel),
            platform: channel.platform,
            contactName: run.contact.name,
            contactUsername: run.contact.username ? `@${run.contact.username.replace(/^@/, "")}` : null,
            contactFacts: contactFacts(run.contact),
            trigger: run.context.triggerText ?? null,
            triggerKind: automation.triggerType,
          },
          history,
        });

        // A reply with buttons is an ordinary interactive message; a plain one
        // is just text. The agent decides which by naming a button or not.
        const reply: OutboundMessage = outcome.ok ? outcome.message : { text: outcome.fallback };
        const result = await sendToContact({
          channel,
          contact: run.contact,
          message: reply,
          vars: templateVars(run.contact, run.context),
          automationId: automation.id,
          viaPrivateReplyCommentId: viaPrivateReply,
        });
        run.context = { ...run.context, aiBusy: undefined };
        if (result.retryable) {
          await deferForRateLimit(run, node.id, result, viaPrivateReply, pending);
          return;
        }
        viaPrivateReply = undefined;
        if (result.status !== DeliveryStatus.SENT) {
          await setSession(session.id, { currentNodeId: node.id, status: FlowSessionStatus.EXPIRED, context: { ...run.context, lastError: result.error } });
          return;
        }
        if (newestInboundAt) run.context = { ...run.context, aiAnsweredAt: newestInboundAt.toISOString() };

        // A failed model call is a handover: the contact got the fallback, and
        // a person should see the thread.
        if (!outcome.ok) {
          run.context = { ...run.context, awaiting: undefined, lastError: `ai_${outcome.reason}` };
          nodeId = nextNodeId(flow, node.id, "handoff") ?? nextNodeId(flow, node.id, "next");
          continue;
        }

        if (outcome.handoff) {
          run.context = { ...run.context, awaiting: undefined };
          nodeId = nextNodeId(flow, node.id, "handoff") ?? nextNodeId(flow, node.id, "next");
          continue;
        }

        const used = turnsUsed + 1;
        if (outcome.done || used >= maxTurns) {
          run.context = { ...run.context, awaiting: undefined };
          nodeId = nextNodeId(flow, node.id, "next");
          continue;
        }

        // Park: the contact's next message comes back as `payload.answer`.
        await setSession(session.id, { currentNodeId: node.id, context: { ...run.context, awaiting: { nodeId: node.id, attempts: used } } });
        return;
      }

      case "condition_follow": {
        const verdict = await resolveFollowStatus(channel, run.contact);
        if (verdict === "token_error") {
          await setSession(session.id, { currentNodeId: node.id, status: FlowSessionStatus.EXPIRED, context: { ...run.context, lastError: "token_expired" } });
          return;
        }
        run.contact = verdict.contact;
        if (verdict.isFollower) {
          nodeId = nextNodeId(flow, node.id, "yes");
          continue;
        }
        const noBranch = nextNodeId(flow, node.id, "no");
        if (noBranch) {
          nodeId = noBranch;
          continue;
        }
        // No "no" branch wired: ask them to follow and park on this node until `follow_check` comes back.
        const prompt: OutboundMessage = {
          text: node.data.retryPrompt?.trim() || defaultRetryPrompt(channel),
          buttons: [{ type: "postback", title: "I'm following", payload: `follow_check:${node.id}` }],
        };
        const result = await sendToContact({
          channel,
          contact: run.contact,
          message: prompt,
          vars: templateVars(run.contact, run.context),
          automationId: automation.id,
          viaPrivateReplyCommentId: viaPrivateReply,
        });
        if (result.retryable) {
          await deferForRateLimit(run, node.id, result, viaPrivateReply);
          return;
        }
        if (result.status !== DeliveryStatus.SENT) {
          await setSession(session.id, { currentNodeId: node.id, status: FlowSessionStatus.EXPIRED, context: { ...run.context, lastError: result.error } });
          return;
        }
        await setSession(session.id, { currentNodeId: node.id, context: run.context });
        return;
      }
    }
  }

  // Walked off the end of the graph (or hit the step guard).
  await setSession(session.id, { status: FlowSessionStatus.COMPLETED, context: run.context });
  logger.info("flow.completed", { sessionId: session.id, automationId: automation.id });
}
