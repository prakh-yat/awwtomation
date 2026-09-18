import { NextResponse } from "next/server";

import { agentUpdateSchema, deleteAgent, updateAgent } from "@/lib/services/ai";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/ai/agents/[id] -> { agent } */
export const PATCH = withWorkspace(
  async (req, ctx, { params }: Params) => {
    const { id } = await params;
    const input = await parseBody(req, agentUpdateSchema);
    return NextResponse.json({ agent: await updateAgent(ctx.workspace.id, id, input) });
  },
  { minRole: "ADMIN" },
);

/** DELETE /api/ai/agents/[id] -> { ok: true } */
export const DELETE = withWorkspace(
  async (_req, ctx, { params }: Params) => {
    const { id } = await params;
    await deleteAgent(ctx.workspace.id, id);
    return NextResponse.json({ ok: true });
  },
  { minRole: "ADMIN" },
);
