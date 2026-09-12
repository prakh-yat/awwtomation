import { NextResponse } from "next/server";

import { addTags, bulkTagsSchema, removeTags } from "@/lib/services/contacts";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/contacts/bulk-tags { ids: string[], add: string[], remove: string[] }
 * → { added: number, removed: number } (rows touched by each operation).
 * Adds run before removes so a tag listed in both ends up removed.
 */
export const POST = withWorkspace(async (req, ctx) => {
  const { ids, add, remove } = await parseBody(req, bulkTagsSchema);
  const added = add.length ? await addTags(ctx.workspace.id, ids, add) : { updated: 0 };
  const removed = remove.length ? await removeTags(ctx.workspace.id, ids, remove) : { updated: 0 };
  return NextResponse.json({ added: added.updated, removed: removed.updated });
});
