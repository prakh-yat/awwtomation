import { NextResponse } from "next/server";

import { deleteProvider, providerUpdateSchema, updateProvider } from "@/lib/services/ai";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/ai/providers/[id] -> { provider }. Omit apiKey to keep the stored one. */
export const PATCH = withWorkspace(
  async (req, ctx, { params }: Params) => {
    const { id } = await params;
    const input = await parseBody(req, providerUpdateSchema);
    return NextResponse.json({ provider: await updateProvider(ctx.workspace.id, id, input) });
  },
  { minRole: "ADMIN" },
);

/** DELETE /api/ai/providers/[id] -> { ok: true }. Agents using it fall back to the default. */
export const DELETE = withWorkspace(
  async (_req, ctx, { params }: Params) => {
    const { id } = await params;
    await deleteProvider(ctx.workspace.id, id);
    return NextResponse.json({ ok: true });
  },
  { minRole: "ADMIN" },
);
