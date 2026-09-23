import { NextResponse } from "next/server";

import { listProviderModels } from "@/lib/services/ai";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/ai/providers/[id]/models -> { models }. Live from the provider, with the stored key. */
export const GET = withWorkspace(
  async (_req, ctx, { params }: Params) => {
    const { id } = await params;
    return NextResponse.json(await listProviderModels(ctx.workspace.id, id));
  },
  { minRole: "ADMIN" },
);
