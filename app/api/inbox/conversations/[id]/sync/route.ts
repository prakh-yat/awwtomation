import { NextResponse } from "next/server";

import { getConversation, syncConversationFromMeta } from "@/lib/services/inbox";
import { ApiError, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * POST /api/inbox/conversations/[id]/sync → { found, imported, total, conversation: ConversationDetail }
 * Pulls the latest messages from Meta and upserts them by mid. 409 CHANNEL_INACTIVE / TOKEN_EXPIRED, 502 META_ERROR.
 */
export const POST = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await syncConversationFromMeta(ctx.workspace.id, id);
  const conversation = await getConversation(ctx.workspace.id, id);
  if (!conversation) throw new ApiError(404, "Conversation not found", "NOT_FOUND");
  return NextResponse.json({ ...result, conversation });
});
