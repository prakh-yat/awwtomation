import { NextResponse } from "next/server";

import { importPreviewSchema, previewImport, readImportBody } from "@/lib/services/contact-import";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** POST /api/contacts/import/preview { csv } → { headers, rows (first 5), rowCount, mapping } */
export const POST = withWorkspace(async (req) => {
  const { csv } = importPreviewSchema.parse(await readImportBody(req));
  return NextResponse.json(previewImport(csv));
});
