import { NextResponse } from "next/server";
import { z } from "zod";

import { contactStageSchema, pipelinesForContact, removeContactsFromPipeline, setContactsStage } from "@/lib/services/pipelines";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** PUT { pipelineId, stageId }: puts the contact at a stage, adding them to the pipeline if needed. */
export const PUT = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { pipelineId, stageId } = await parseBody(req, contactStageSchema);
  const result = await setContactsStage(ctx.workspace.id, [id], pipelineId, stageId, { actorId: ctx.user.id });
  if (result.updated === 0) {
    const current = await pipelinesForContact(ctx.workspace.id, id);
    if (!current.some((p) => p.pipelineId === pipelineId && p.stageId === stageId)) throw new ApiError(404, "Contact not found", "NOT_FOUND");
  }
  return NextResponse.json({ pipelines: await pipelinesForContact(ctx.workspace.id, id) });
});

const removeSchema = z.object({ pipelineId: z.string().min(1).max(64) }).strict();

/** DELETE { pipelineId }: takes the contact out of that pipeline. */
export const DELETE = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { pipelineId } = await parseBody(req, removeSchema);
  await removeContactsFromPipeline(ctx.workspace.id, [id], pipelineId, { actorId: ctx.user.id });
  return NextResponse.json({ pipelines: await pipelinesForContact(ctx.workspace.id, id) });
});
