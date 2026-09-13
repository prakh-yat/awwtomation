import { NextResponse } from "next/server";

import { addNote, createNoteSchema, listNotes, listNotesQuerySchema } from "@/lib/services/contact-notes";
import { parseBody, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/contacts/[id]/notes?limit= → { notes: ContactNoteSummary[] } newest first. */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { limit } = parseQuery(req, listNotesQuerySchema);
  const notes = await listNotes(ctx.workspace.id, id, { limit });
  return NextResponse.json({ notes });
});

/** POST /api/contacts/[id]/notes { body } → 201 { note } */
export const POST = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { body } = await parseBody(req, createNoteSchema);
  const note = await addNote(ctx.workspace.id, id, ctx.user.id, body);
  return NextResponse.json({ note }, { status: 201 });
});
