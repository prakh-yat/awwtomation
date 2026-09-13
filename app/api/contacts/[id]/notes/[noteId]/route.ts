import { NextResponse } from "next/server";

import { deleteNote, updateNote, updateNoteSchema } from "@/lib/services/contact-notes";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string; noteId: string };

/** PATCH /api/contacts/[id]/notes/[noteId] { body } → { note }. Author or admin only. */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id, noteId } = await params;
  const { body } = await parseBody(req, updateNoteSchema);
  const note = await updateNote(ctx.workspace.id, noteId, { id: ctx.user.id, role: ctx.role }, body, id);
  return NextResponse.json({ note });
});

/** DELETE /api/contacts/[id]/notes/[noteId] → { ok: true }. Author or admin only. */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id, noteId } = await params;
  await deleteNote(ctx.workspace.id, noteId, { id: ctx.user.id, role: ctx.role }, id);
  return NextResponse.json({ ok: true });
});
