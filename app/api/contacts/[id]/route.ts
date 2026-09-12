import { NextResponse } from "next/server";

import { deleteContact, getContact, updateContact, updateContactSchema } from "@/lib/services/contacts";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/contacts/[id] → { contact, conversation, flowSessions, deliveryLogs, linkClicks, messages, stats } */
export const GET = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const detail = await getContact(ctx.workspace.id, id);
  if (!detail) throw new ApiError(404, "Contact not found", "NOT_FOUND");
  return NextResponse.json(detail);
});

/**
 * PATCH /api/contacts/[id] { tags?, customFields?, optedOut?, name? } → { contact }
 * This payload is the contract the Inbox lane uses to edit a contact in-thread.
 */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const data = await parseBody(req, updateContactSchema);
  const contact = await updateContact(ctx.workspace.id, id, data);
  return NextResponse.json({ contact });
});

/** DELETE /api/contacts/[id] → { ok: true } */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await deleteContact(ctx.workspace.id, id);
  return NextResponse.json({ ok: true });
});
