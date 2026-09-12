/**
 * Pipeline stages — the ordered list every contact's `stage` points at.
 *
 * Stages live as a JSON array on the workspace (`Workspace.pipelineStages`)
 * and contacts store the stage *name*, so renaming or deleting a stage has to
 * rewrite contacts in the same transaction or the board would show orphans.
 * Every function takes `workspaceId` first and scopes each query by it.
 */
import { Prisma, type Workspace } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { buildContactWhere, type SegmentFilters } from "@/lib/services/segments";
import { recordAudit } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── Limits ─────────────────────────

export const DEFAULT_PIPELINE_STAGES: readonly string[] = ["New", "Engaged", "Lead", "Customer", "Lost"];
export const PIPELINE_MIN_STAGES = 2;
export const PIPELINE_MAX_STAGES = 12;
export const PIPELINE_STAGE_MAX_LENGTH = 24;

// ───────────────────────── Validation ─────────────────────────

export const stageNameSchema = z
  .string()
  .trim()
  .min(1, "Stage names can't be empty")
  .max(PIPELINE_STAGE_MAX_LENGTH, `Stage names are at most ${PIPELINE_STAGE_MAX_LENGTH} characters`);

function uniqueIgnoringCase(stages: string[]): boolean {
  const seen = new Set<string>();
  for (const s of stages) {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export const stagesSchema = z
  .array(stageNameSchema)
  .min(PIPELINE_MIN_STAGES, `Keep at least ${PIPELINE_MIN_STAGES} stages`)
  .max(PIPELINE_MAX_STAGES, `At most ${PIPELINE_MAX_STAGES} stages`)
  .refine(uniqueIgnoringCase, { message: "Stage names must be unique" });

/**
 * PUT /api/pipeline body. `renames` maps an *old* name to its *new* name so a
 * rename can be told apart from a delete + add (which would move contacts to
 * the first stage instead of carrying them along).
 */
export const updateStagesSchema = z
  .object({
    stages: stagesSchema,
    renames: z.record(z.string().min(1).max(PIPELINE_STAGE_MAX_LENGTH), stageNameSchema).optional(),
  })
  .strict();

export type UpdateStagesInput = z.infer<typeof updateStagesSchema>;

export type StageCount = { stage: string; count: number };

export type UpdateStagesResult = { stages: string[]; renamed: number; moved: number };

// ───────────────────────── Reads ─────────────────────────

/** Tolerant read of the stored JSON: anything unusable falls back to the defaults so the board always renders. */
export function parsePipelineStages(json: Prisma.JsonValue | null | undefined): string[] {
  const parsed = stagesSchema.safeParse(json);
  return parsed.success ? parsed.data : [...DEFAULT_PIPELINE_STAGES];
}

/** Accepts the workspace row already on the request context (no query) or a workspace id (one query). */
export async function getStages(workspace: Pick<Workspace, "pipelineStages"> | string): Promise<string[]> {
  if (typeof workspace !== "string") return parsePipelineStages(workspace.pipelineStages);
  const row = await prisma.workspace.findUnique({ where: { id: workspace }, select: { pipelineStages: true } });
  return parsePipelineStages(row?.pipelineStages);
}

/** Throws 422 unless `stage` is one of the workspace's stages. Returns the canonical-cased name. */
export async function requireStage(workspaceId: string, stage: string): Promise<string> {
  const stages = await getStages(workspaceId);
  const match = stages.find((s) => s.toLowerCase() === stage.trim().toLowerCase());
  if (!match) throw new ApiError(422, `“${stage}” isn't a pipeline stage. Add it under Settings → Pipeline first.`, "UNKNOWN_STAGE");
  return match;
}

/**
 * Contacts per stage in pipeline order, zero-filled. Contacts whose stage no
 * longer exists (a race with a rename) are folded into the first stage, which
 * is also where `updateStages` would have put them.
 */
export async function stageCounts(workspaceId: string, filters: SegmentFilters = {}): Promise<StageCount[]> {
  const [stages, rows] = await Promise.all([
    getStages(workspaceId),
    prisma.contact.groupBy({ by: ["stage"], where: buildContactWhere(workspaceId, filters), _count: { _all: true } }),
  ]);
  const counts = new Map<string, number>(stages.map((s) => [s, 0]));
  const first = stages[0];
  for (const row of rows) {
    const key = counts.has(row.stage) ? row.stage : first;
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + row._count._all);
  }
  return stages.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
}

// ───────────────────────── Writes ─────────────────────────

/**
 * Replace the stage list. Runs in one transaction with the contact rewrites:
 * - a rename (`renames[old] = new`) moves contacts from `old` to `new`;
 * - a stage that disappears without a rename moves its contacts to the first stage;
 * - any contact left pointing at an unknown stage is also moved to the first stage.
 */
export async function updateStages(workspaceId: string, input: UpdateStagesInput, actorId?: string | null): Promise<UpdateStagesResult> {
  const { stages, renames = {} } = updateStagesSchema.parse(input);
  const first = stages[0] as string;

  const result = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { pipelineStages: true } });
    if (!workspace) throw new ApiError(404, "Workspace not found", "NOT_FOUND");
    const current = parsePipelineStages(workspace.pipelineStages);

    let renamed = 0;
    const carried = new Set<string>();
    for (const [from, to] of Object.entries(renames)) {
      // Only honour renames that describe a real transition; anything else is a no-op rather than an error.
      if (from === to || !current.includes(from) || !stages.includes(to)) continue;
      const res = await tx.contact.updateMany({ where: { workspaceId, stage: from }, data: { stage: to } });
      renamed += res.count;
      carried.add(from);
    }

    const moved = await tx.contact.updateMany({
      where: { workspaceId, stage: { notIn: stages } },
      data: { stage: first },
    });

    await tx.workspace.update({ where: { id: workspaceId }, data: { pipelineStages: stages } });
    return { stages, renamed, moved: moved.count, removed: current.filter((s) => !stages.includes(s) && !carried.has(s)) };
  });

  await recordAudit({
    workspaceId,
    userId: actorId,
    action: "pipeline.update",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { stages, renames, removed: result.removed, renamedContacts: result.renamed, movedContacts: result.moved },
  });
  logger.info("pipeline.updated", { workspaceId, stages: stages.length, renamed: result.renamed, moved: result.moved });
  return { stages: result.stages, renamed: result.renamed, moved: result.moved };
}
