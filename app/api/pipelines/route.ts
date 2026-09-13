import { NextResponse } from "next/server";

import { createPipeline, createPipelineSchema, listPipelines } from "@/lib/services/pipelines";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** Pipelines with their stages and contact counts. Any member may read them. */
export const GET = withWorkspace(async (_req, ctx) => {
  return NextResponse.json({ pipelines: await listPipelines(ctx.workspace.id) });
});

/** Adds a pipeline (admins and owners). Starts with the default stages unless `stages` is given. */
export const POST = withWorkspace(
  async (req, ctx) => {
    const input = await parseBody(req, createPipelineSchema);
    const pipeline = await createPipeline(ctx.workspace.id, input, ctx.user.id);
    return NextResponse.json({ pipeline }, { status: 201 });
  },
  { minRole: "ADMIN" },
);
