import { ConversationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assign, getConversation, setStatus } from "@/lib/services/inbox";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/inbox/conversations/[id] → { conversation: ConversationDetail } (newest 50 messages included). */
export const GET = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const conversation = await getConversation(ctx.workspace.id, id);
  if (!conversation) throw new ApiError(404, "Conversation not found", "NOT_FOUND");
  return NextResponse.json({ conversation });
});

const patchSchema = z
  .object({
    status: z.nativeEnum(ConversationStatus).optional(),
    // null unassigns; omit to leave assignment untouched.
    assignedToId: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((d) => d.status !== undefined || d.assignedToId !== undefined, { message: "Nothing to update" });

/** PATCH /api/inbox/conversations/[id] { status?, assignedToId?: string | null } → { conversation } */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, patchSchema);

  if (body.status !== undefined) await setStatus(ctx.workspace.id, id, body.status);
  if (body.assignedToId !== undefined) await assign(ctx.workspace.id, id, body.assignedToId);

  const conversation = await getConversation(ctx.workspace.id, id);
  if (!conversation) throw new ApiError(404, "Conversation not found", "NOT_FOUND");
  return NextResponse.json({ conversation });
});
