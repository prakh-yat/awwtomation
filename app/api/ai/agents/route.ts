import { NextResponse } from "next/server";

import { agentCreateSchema, createAgent, listAgents } from "@/lib/services/ai";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/ai/agents -> { agents: AgentView[] } */
export const GET = withWorkspace(async (_req, ctx) => {
  return NextResponse.json({ agents: await listAgents(ctx.workspace.id) });
});

/** POST /api/ai/agents -> { agent } */
export const POST = withWorkspace(
  async (req, ctx) => {
    const input = await parseBody(req, agentCreateSchema);
    return NextResponse.json({ agent: await createAgent(ctx.workspace.id, input) }, { status: 201 });
  },
  { minRole: "ADMIN" },
);
