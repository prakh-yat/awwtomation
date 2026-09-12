import { NextResponse } from "next/server";
import { z } from "zod";

import { outboundMessageSchema } from "@/lib/automation/flow-types";
import { assertRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { DEFAULT_MESSAGE_LIMIT, listMessages, MAX_MESSAGE_LIMIT, sendReply } from "@/lib/services/inbox";
import { parseBody, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** Per-user send cap; a human agent never types faster, and it blunts a stolen session or runaway script. */
const SEND_LIMIT_PER_MINUTE = 60;

const listQuerySchema = z.object({
  // id of the oldest message already on screen; the page returned is strictly older.
  before: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_MESSAGE_LIMIT).default(DEFAULT_MESSAGE_LIMIT),
});

/** GET /api/inbox/conversations/[id]/messages?before=&limit= → { messages: InboxMessage[] (newest last), hasMore } */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const query = parseQuery(req, listQuerySchema);
  const page = await listMessages(ctx.workspace.id, id, query);
  return NextResponse.json(page);
});

const sendSchema = z.object({
  message: outboundMessageSchema,
  humanAgent: z.boolean().optional(),
});

/**
 * POST /api/inbox/conversations/[id]/messages { message: OutboundMessage, humanAgent?: boolean } → { message: InboxMessage }
 * 409 WINDOW_CLOSED outside Meta's window, 429 RATE_LIMITED, 402 PLAN_LIMIT, 502 META_ERROR / SEND_FAILED.
 */
export const POST = withWorkspace<Params>(async (req, ctx, { params }) => {
  assertRateLimit("inbox_send", ctx.user.id, SEND_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  const { id } = await params;
  const body = await parseBody(req, sendSchema);
  const message = await sendReply(ctx.workspace.id, id, ctx.user.id, body.message, { humanAgent: body.humanAgent });
  return NextResponse.json({ message }, { status: 201 });
});
