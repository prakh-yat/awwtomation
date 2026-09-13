import { NextResponse } from "next/server";

import { importRunSchema, readImportBody, runImport } from "@/lib/services/contact-import";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/contacts/import { csv, channelId, mapping, defaultStage?, addTags? }
 * → { created, duplicates, invalid, errors: Array<{ row, reason }> }
 */
export const POST = withWorkspace(async (req, ctx) => {
  const input = importRunSchema.parse(await readImportBody(req));
  const result = await runImport(ctx.workspace.id, input, ctx.user.id);
  return NextResponse.json(result);
});
