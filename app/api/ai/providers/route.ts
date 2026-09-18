import { NextResponse } from "next/server";

import { createProvider, listProviders, providerCreateSchema } from "@/lib/services/ai";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/ai/providers -> { providers: ProviderView[] }. Never includes the key. */
export const GET = withWorkspace(async (_req, ctx) => {
  return NextResponse.json({ providers: await listProviders(ctx.workspace.id) });
});

/** POST /api/ai/providers -> { provider }. Admin only: the key is the workspace's money. */
export const POST = withWorkspace(
  async (req, ctx) => {
    const input = await parseBody(req, providerCreateSchema);
    return NextResponse.json({ provider: await createProvider(ctx.workspace.id, input) }, { status: 201 });
  },
  { minRole: "ADMIN" },
);
