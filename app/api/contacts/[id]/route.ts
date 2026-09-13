import { NextResponse } from "next/server";

import { deleteContact, getContact, updateContact, updateContactSchema } from "@/lib/services/contacts";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/contacts/[id] → { contact, conversation, flowSessions, deliveryLogs, linkClicks, messages, notes, stageChanges, timeline, stats } */
export const GET = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const detail = await getContact(ctx.workspace.id, id);
  if (!detail) throw new ApiError(404, "Contact not found", "NOT_FOUND");
  return NextResponse.json(detail);
});

/**
 * PATCH /api/contacts/[id] { tags?, customFields?, optedOut?, name?, stage?, ownerId?, email?, phone? } → { ok: true }
 * The Inbox edits a contact in-thread with the first four; the CRM profile uses the rest.
 */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const data = await parseBody(req, updateContactSchema);
  await updateContact(ctx.workspace.id, id, data, ctx.user.id);
  return NextResponse.json({ ok: true });
});

/** DELETE /api/contacts/[id] → { ok: true } */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await deleteContact(ctx.workspace.id, id);
  return NextResponse.json({ ok: true });
});
