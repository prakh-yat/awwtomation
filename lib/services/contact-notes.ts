/**
 * Contact notes: free-text CRM notes, newest first. `Contact.notesCount` is
 * kept in step inside the same transaction so list rows never need a join.
 * Every function takes `workspaceId` first and scopes each query by it.
 *
 * Leaf module on purpose: contacts.ts imports it to build the profile
 * timeline, so it must not import contacts.ts back.
 */
import { type WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/workspace/api";
import { roleAtLeast } from "@/lib/workspace/permissions";

// ───────────────────────── Limits ─────────────────────────

export const NOTE_MAX_LENGTH = 4000;
export const NOTES_DEFAULT_LIMIT = 50;
export const NOTES_MAX_LIMIT = 200;

// ───────────────────────── Validation ─────────────────────────

export const noteBodySchema = z.string().trim().min(1, "Write something first").max(NOTE_MAX_LENGTH, `Notes are at most ${NOTE_MAX_LENGTH} characters`);

export const createNoteSchema = z.object({ body: noteBodySchema }).strict();
export const updateNoteSchema = z.object({ body: noteBodySchema }).strict();

export const listNotesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(NOTES_MAX_LIMIT).default(NOTES_DEFAULT_LIMIT),
});

// ───────────────────────── Types ─────────────────────────

export type NoteAuthor = { id: string; name: string | null; email: string; avatarUrl: string | null };

/** JSON-safe (ISO dates) so the same shape serves server pages and the API. */
export type ContactNoteSummary = {
  id: string;
  contactId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: NoteAuthor | null;
};

/** Who is asking: needed because editing is limited to the author or an admin. */
export type NoteActor = { id: string; role: WorkspaceRole };

const noteSelect = {
  id: true,
  contactId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const;

type NoteRow = {
  id: string;
  contactId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: NoteAuthor | null;
};

function toSummary(row: NoteRow): ContactNoteSummary {
  return {
    id: row.id,
    contactId: row.contactId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: row.author,
  };
}

function notFound(): ApiError {
  return new ApiError(404, "Note not found", "NOT_FOUND");
}

// ───────────────────────── Reads ─────────────────────────

export async function listNotes(workspaceId: string, contactId: string, opts: { limit?: number } = {}): Promise<ContactNoteSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? NOTES_DEFAULT_LIMIT, 1), NOTES_MAX_LIMIT);
  // A contact from another workspace would otherwise read as one with no notes;
  // the rest of the API answers 404 for an id that isn't ours, so this does too.
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } });
  if (!contact) throw new ApiError(404, "Contact not found", "NOT_FOUND");
  const rows = await prisma.contactNote.findMany({
    where: { workspaceId, contactId },
    select: noteSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map(toSummary);
}

// ───────────────────────── Writes ─────────────────────────

export async function addNote(workspaceId: string, contactId: string, authorId: string, body: string): Promise<ContactNoteSummary> {
  const clean = noteBodySchema.parse(body);
  const row = await prisma.$transaction(async (tx) => {
    // updateMany carries the workspace scope; a zero count means the contact isn't ours (or is gone).
    const bumped = await tx.contact.updateMany({ where: { id: contactId, workspaceId }, data: { notesCount: { increment: 1 } } });
    if (bumped.count === 0) throw new ApiError(404, "Contact not found", "NOT_FOUND");
    return tx.contactNote.create({ data: { workspaceId, contactId, authorId, body: clean }, select: noteSelect });
  });
  logger.info("contact.note_added", { workspaceId, contactId, noteId: row.id });
  return toSummary(row);
}

/** The author may edit their own note; ADMIN+ may edit anyone's. `contactId`, when given, must match the note's contact. */
async function requireEditableNote(workspaceId: string, noteId: string, actor: NoteActor, contactId?: string): Promise<NoteRow> {
  const row = await prisma.contactNote.findFirst({ where: { id: noteId, workspaceId, ...(contactId ? { contactId } : {}) }, select: noteSelect });
  if (!row) throw notFound();
  const isAuthor = row.author?.id === actor.id;
  if (!isAuthor && !roleAtLeast(actor.role, "ADMIN")) {
    throw new ApiError(403, "Only the note's author or an admin can change it", "FORBIDDEN");
  }
  return row;
}

export async function updateNote(workspaceId: string, noteId: string, actor: NoteActor, body: string, contactId?: string): Promise<ContactNoteSummary> {
  const clean = noteBodySchema.parse(body);
  await requireEditableNote(workspaceId, noteId, actor, contactId);
  const row = await prisma.contactNote.update({ where: { id: noteId }, data: { body: clean }, select: noteSelect });
  logger.info("contact.note_updated", { workspaceId, noteId, actorId: actor.id });
  return toSummary(row);
}

export async function deleteNote(workspaceId: string, noteId: string, actor: NoteActor, contactId?: string): Promise<void> {
  const row = await requireEditableNote(workspaceId, noteId, actor, contactId);
  await prisma.$transaction([
    prisma.contactNote.delete({ where: { id: noteId } }),
    prisma.contact.updateMany({ where: { id: row.contactId, workspaceId, notesCount: { gt: 0 } }, data: { notesCount: { decrement: 1 } } }),
  ]);
  logger.info("contact.note_deleted", { workspaceId, noteId, actorId: actor.id });
}
