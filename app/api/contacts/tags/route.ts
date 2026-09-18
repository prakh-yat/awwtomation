import { NextResponse } from "next/server";

import { deleteTag, deleteTagSchema, listTags, renameTag, renameTagSchema } from "@/lib/services/contacts";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/contacts/tags → { tags: Array<{ tag: string; count: number }> } sorted by usage. */
export const GET = withWorkspace(async (_req, ctx) => {
  const tags = await listTags(ctx.workspace.id);
  return NextResponse.json({ tags });
});

/** PATCH /api/contacts/tags { from, to } → { updated: number }, renames the tag on every contact. */
export const PATCH = withWorkspace(async (req, ctx) => {
  const { from, to } = await parseBody(req, renameTagSchema);
  const result = await renameTag(ctx.workspace.id, from, to);
  return NextResponse.json(result);
});

/** DELETE /api/contacts/tags { tag } → { updated: number }, strips the tag from every contact. */
export const DELETE = withWorkspace(async (req, ctx) => {
  const { tag } = await parseBody(req, deleteTagSchema);
  const result = await deleteTag(ctx.workspace.id, tag);
  return NextResponse.json(result);
});
