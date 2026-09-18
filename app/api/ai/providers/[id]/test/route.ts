import { NextResponse } from "next/server";

import { testProvider } from "@/lib/services/ai";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST /api/ai/providers/[id]/test -> { ok, message }. One tiny completion, to prove the key works. */
export const POST = withWorkspace(
  async (_req, ctx, { params }: Params) => {
    const { id } = await params;
    return NextResponse.json(await testProvider(ctx.workspace.id, id));
  },
  { minRole: "ADMIN" },
);
