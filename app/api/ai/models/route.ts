import { NextResponse } from "next/server";

import { modelPreviewSchema, previewModels } from "@/lib/services/ai";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/ai/models { kind, apiKey, baseUrl? } -> { models }.
 *
 * Lists what a key can use before it is saved, so the connect dialog can offer
 * real model names. The key is used for this one request and not stored.
 */
export const POST = withWorkspace(
  async (req) => {
    const input = await parseBody(req, modelPreviewSchema);
    return NextResponse.json(await previewModels(input));
  },
  { minRole: "ADMIN" },
);
