import { NextResponse } from "next/server";

import { deletePipeline, updatePipeline, updatePipelineSchema } from "@/lib/services/pipelines";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** Rename and/or replace the stage list (admins and owners). Contacts in removed stages move, never disappear. */
export const PUT = withWorkspace<Params>(
  async (req, ctx, { params }) => {
    const { id } = await params;
    const input = await parseBody(req, updatePipelineSchema);
    const pipeline = await updatePipeline(ctx.workspace.id, id, input, ctx.user.id);
    return NextResponse.json({ pipeline });
  },
  { minRole: "ADMIN" },
);

/** Deletes the pipeline; the contacts in it stay in the workspace. */
export const DELETE = withWorkspace<Params>(
  async (_req, ctx, { params }) => {
    const { id } = await params;
    await deletePipeline(ctx.workspace.id, id, ctx.user.id);
    return NextResponse.json({ ok: true });
  },
  { minRole: "ADMIN" },
);
