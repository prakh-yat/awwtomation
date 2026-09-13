import { NextResponse } from "next/server";

import { addTags, bulkUpdateSchema, removeTags, setOwner } from "@/lib/services/contacts";
import { removeContactsFromPipeline, setContactsStage } from "@/lib/services/pipelines";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/contacts/bulk { ids, pipelineId?+stageId?, removeFromPipelineId?, ownerId?, addTags?, removeTags? }
 * → { stage, removedFromPipeline, owner, tagsAdded, tagsRemoved } (rows changed by each action).
 */
export const POST = withWorkspace(async (req, ctx) => {
  const input = await parseBody(req, bulkUpdateSchema);
  const workspaceId = ctx.workspace.id;
  const source = { actorId: ctx.user.id };

  const stage =
    input.pipelineId && input.stageId ? await setContactsStage(workspaceId, input.ids, input.pipelineId, input.stageId, source) : { updated: 0 };
  const left = input.removeFromPipelineId ? await removeContactsFromPipeline(workspaceId, input.ids, input.removeFromPipelineId, source) : { removed: 0 };
  const owner = input.ownerId !== undefined ? await setOwner(workspaceId, input.ids, input.ownerId) : { updated: 0 };
  const added = input.addTags?.length ? await addTags(workspaceId, input.ids, input.addTags) : { updated: 0 };
  const removed = input.removeTags?.length ? await removeTags(workspaceId, input.ids, input.removeTags) : { updated: 0 };

  return NextResponse.json({
    stage: stage.updated,
    removedFromPipeline: left.removed,
    owner: owner.updated,
    tagsAdded: added.updated,
    tagsRemoved: removed.updated,
  });
});
