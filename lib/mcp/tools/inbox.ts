/**
 * The inbox as tools: read conversations, reply, assign, close and re-sync.
 * Replies go to real people through Meta, under the same per-person rate
 * limit and message window as the inbox page.
 */
import { ConversationStatus } from "@prisma/client";
import { z } from "zod";

import { outboundMessageSchema } from "@/lib/automation/flow-types";
import { assertRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import {
  assign,
  getConversation,
  getInboxCounts,
  listConversations,
  listMessages,
  markRead,
  sendReply,
  setStatus,
  syncConversationFromMeta,
} from "@/lib/services/inbox";
import { ApiError } from "@/lib/workspace/api";

import { messageInput, toOutboundMessage } from "../flow";
import { workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

/** Same budget as POST /api/inbox/conversations/[id]/messages. */
const SEND_LIMIT_PER_MINUTE = 60;

const conversationId = z.string().describe("Conversation id from list_conversations.");

async function requireConversation(workspaceId: string, id: string) {
  const conversation = await getConversation(workspaceId, id);
  if (!conversation) throw new ApiError(404, "Conversation not found", "NOT_FOUND");
  return conversation;
}

export const inboxTools = [
  workspaceTool({
    name: "list_conversations",
    title: "List inbox conversations",
    description: "Inbox threads, newest first, with the contact, last message, unread count and whether the reply window is open. Also returns the open, unread and assigned-to-you counts. Page with cursor.",
    annotations: READ,
    input: {
      channelId: z.string().optional().describe("Only this account."),
      status: z.enum(["OPEN", "CLOSED", "ALL"]).optional().describe("Defaults to OPEN."),
      assigned: z.enum(["me", "unassigned", "all"]).optional().describe("Defaults to all."),
      unread: z.boolean().optional().describe("Only threads with unread messages."),
      q: z.string().max(100).optional().describe("Search contact name, @username or the last message."),
      cursor: z.string().max(64).optional().describe("nextCursor from the previous page."),
      limit: z.number().int().min(1).max(100).optional(),
    },
    run: async (args, ctx) => {
      const status = args.status ?? "OPEN";
      const [page, counts] = await Promise.all([
        listConversations(ctx.workspace.id, {
          channelId: args.channelId,
          status: status === "ALL" ? undefined : status,
          assigned: args.assigned ?? "all",
          unread: args.unread,
          q: args.q?.trim() || undefined,
          cursor: args.cursor,
          limit: args.limit,
          viewerId: ctx.user.id,
        }),
        getInboxCounts(ctx.workspace.id, ctx.user.id),
      ]);
      return { ...page, counts };
    },
  }),

  workspaceTool({
    name: "get_conversation",
    title: "Get a conversation",
    description: "One thread with the contact, its status, assignee, reply window and its newest 50 messages. list_messages pages further back.",
    annotations: READ,
    input: { conversationId },
    run: async (args, ctx) => ({ conversation: await requireConversation(ctx.workspace.id, args.conversationId) }),
  }),

  workspaceTool({
    name: "list_messages",
    title: "List older messages",
    description: "Messages in a thread, oldest to newest, before a given message id. Use it to read further back than get_conversation.",
    annotations: READ,
    input: {
      conversationId,
      before: z.string().max(64).optional().describe("Id of the oldest message you already have."),
      limit: z.number().int().min(1).max(100).optional(),
    },
    run: async (args, ctx) => listMessages(ctx.workspace.id, args.conversationId, { before: args.before, limit: args.limit }),
  }),

  workspaceTool({
    name: "send_message",
    title: "Reply in a conversation",
    description:
      "Send a DM in a thread, as the workspace. Meta only delivers inside the reply window (24 hours after the contact's last message); with humanAgent true a person may reply for up to 7 days. Counts toward the plan's monthly DMs. This reaches a real person: confirm the text with the user first.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    input: {
      conversationId,
      message: messageInput.describe("Text, up to 3 link buttons, an image or quick replies."),
      humanAgent: z.boolean().optional().describe("Mark it as a person's reply, allowed up to 7 days after the contact's last message."),
    },
    run: async (args, ctx) => {
      assertRateLimit("inbox_send", ctx.user.id, SEND_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
      const message = await sendReply(ctx.workspace.id, args.conversationId, ctx.user.id, outboundMessageSchema.parse(toOutboundMessage(args.message)), { humanAgent: args.humanAgent });
      return { message };
    },
  }),

  workspaceTool({
    name: "update_conversation",
    title: "Update a conversation",
    description: "Close or reopen a thread, assign it to a teammate (userId from list_team) or unassign it with null, and mark it read.",
    annotations: WRITE,
    input: {
      conversationId,
      status: z.nativeEnum(ConversationStatus).optional().describe("OPEN or CLOSED."),
      assignedToId: z.string().nullable().optional().describe("A teammate's userId, or null to unassign."),
      markRead: z.boolean().optional().describe("Clear the unread count."),
    },
    run: async (args, ctx) => {
      if (args.status === undefined && args.assignedToId === undefined && !args.markRead) {
        throw new ApiError(422, "Nothing to update: pass status, assignedToId or markRead.", "VALIDATION");
      }
      await requireConversation(ctx.workspace.id, args.conversationId);
      if (args.status !== undefined) await setStatus(ctx.workspace.id, args.conversationId, args.status);
      if (args.assignedToId !== undefined) await assign(ctx.workspace.id, args.conversationId, args.assignedToId);
      if (args.markRead) await markRead(ctx.workspace.id, args.conversationId);
      return { conversation: await requireConversation(ctx.workspace.id, args.conversationId) };
    },
  }),

  workspaceTool({
    name: "sync_conversation",
    title: "Sync a conversation from Meta",
    description: "Pull the latest messages of a thread from Instagram or Messenger, for when something seems missing.",
    annotations: WRITE,
    input: { conversationId },
    run: async (args, ctx) => {
      const result = await syncConversationFromMeta(ctx.workspace.id, args.conversationId);
      return { ...result, conversation: await requireConversation(ctx.workspace.id, args.conversationId) };
    },
  }),
];
