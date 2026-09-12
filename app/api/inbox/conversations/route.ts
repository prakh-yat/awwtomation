import { NextResponse } from "next/server";
import { z } from "zod";

import { DEFAULT_LIST_LIMIT, listConversations, MAX_LIST_LIMIT } from "@/lib/services/inbox";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const flag = z
  .enum(["1", "0", "true", "false"])
  .optional()
  .transform((v) => v === "1" || v === "true");

const listQuerySchema = z.object({
  channelId: z.string().min(1).max(64).optional(),
  // Default to open threads; "ALL" spans both statuses (e.g. search).
  status: z.enum(["OPEN", "CLOSED", "ALL"]).default("OPEN"),
  assigned: z.enum(["me", "unassigned", "all"]).default("all"),
  unread: flag,
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
});

/**
 * GET /api/inbox/conversations?channelId&status=OPEN|CLOSED|ALL&assigned=me|unassigned|all&unread=1&q&cursor&limit
 * → { items: ConversationListItem[], nextCursor: string | null }
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, listQuerySchema);
  const page = await listConversations(ctx.workspace.id, {
    channelId: query.channelId,
    status: query.status === "ALL" ? undefined : query.status,
    assigned: query.assigned,
    unread: query.unread,
    q: query.q,
    cursor: query.cursor,
    limit: query.limit,
    viewerId: ctx.user.id,
  });
  return NextResponse.json(page);
});
