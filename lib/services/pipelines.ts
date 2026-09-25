/**
 * Pipelines: the funnels contacts move through. A workspace can have several
 * (sales, wholesale, support…); a contact can sit in any number of them at one
 * stage each, or in none. Stages carry a colour key from lib/pipelines/colors.ts.
 *
 * Every stage move writes an AuditLog row (`contact.stage_changed`) that the
 * contact timeline and the analytics lead count read back. Every function
 * takes `workspaceId` first and scopes each query by it.
 */
import { Prisma, type PipelineStage } from "@prisma/client";
import { z } from "zod";

import { checkWorkspaceLimit } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DEFAULT_STAGES, isStageColor, STAGE_COLORS } from "@/lib/pipelines/colors";
import { recordAudit } from "@/lib/services/audit";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── Limits ─────────────────────────

export const MAX_PIPELINES_PER_WORKSPACE = 20;
export const PIPELINE_NAME_MAX_LENGTH = 40;
export const PIPELINE_MIN_STAGES = 2;
export const PIPELINE_MAX_STAGES = 12;
export const PIPELINE_STAGE_MAX_LENGTH = 24;
/** Bulk moves are capped like every other bulk contact action. */
const BULK_MAX_IDS = 500;

/** AuditLog action for a contact entering a pipeline or changing stage. */
export const AUDIT_STAGE_CHANGED = "contact.stage_changed";
/** AuditLog action for a contact leaving a pipeline. */
export const AUDIT_PIPELINE_REMOVED = "contact.pipeline_removed";

// ───────────────────────── Validation ─────────────────────────

export const pipelineNameSchema = z
  .string()
  .trim()
  .min(1, "Give the pipeline a name")
  .max(PIPELINE_NAME_MAX_LENGTH, `Pipeline names are at most ${PIPELINE_NAME_MAX_LENGTH} characters`);

export const stageNameSchema = z
  .string()
  .trim()
  .min(1, "Stage names can't be empty")
  .max(PIPELINE_STAGE_MAX_LENGTH, `Stage names are at most ${PIPELINE_STAGE_MAX_LENGTH} characters`);

const stageColorSchema = z.enum(STAGE_COLORS);

/** One stage in an edit: `id` for a stage that already exists (a rename keeps its contacts), none for a new one. */
export const stageInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: stageNameSchema,
  color: stageColorSchema,
});

function uniqueNames(stages: Array<{ name: string }>): boolean {
  const seen = new Set<string>();
  for (const s of stages) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

const stagesInputSchema = z
  .array(stageInputSchema)
  .min(PIPELINE_MIN_STAGES, `Keep at least ${PIPELINE_MIN_STAGES} stages`)
  .max(PIPELINE_MAX_STAGES, `At most ${PIPELINE_MAX_STAGES} stages`)
  .refine(uniqueNames, { message: "Stage names must be unique" });

export const createPipelineSchema = z
  .object({
    name: pipelineNameSchema,
    stages: stagesInputSchema.optional(),
  })
  .strict();

/**
 * PUT body. `stages` is the complete new list in order. A stage that
 * disappears moves its contacts to `moveRemovedTo` (an id from the new list,
 * or a new stage's name) or, failing that, to the first stage.
 */
export const updatePipelineSchema = z
  .object({
    name: pipelineNameSchema.optional(),
    stages: stagesInputSchema.optional(),
    moveRemovedTo: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.stages !== undefined, { message: "Nothing to update" });

export const contactStageSchema = z.object({ pipelineId: z.string().min(1).max(64), stageId: z.string().min(1).max(64) }).strict();

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;

// ───────────────────────── Types ─────────────────────────

export type PipelineStageSummary = { id: string; name: string; color: string; position: number; count: number };

export type PipelineSummary = { id: string; name: string; position: number; total: number; stages: PipelineStageSummary[] };

/** A contact's place in one pipeline, as lists and the profile page show it. */
export type ContactPipelineRef = {
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  stageColor: string;
  stagePosition: number;
  /** ISO timestamp of the last stage change. */
  updatedAt: string;
};

export type StageMoveSource = { actorId?: string | null; automationId?: string | null };

// ───────────────────────── Reads ─────────────────────────

/** Every pipeline with its stages in order and live contact counts. */
export async function listPipelines(workspaceId: string): Promise<PipelineSummary[]> {
  const [pipelines, counts] = await Promise.all([
    prisma.pipeline.findMany({
      where: { workspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, position: true, stages: { orderBy: { position: "asc" }, select: { id: true, name: true, color: true, position: true } } },
    }),
    prisma.pipelineEntry.groupBy({ by: ["stageId"], where: { workspaceId }, _count: { _all: true } }),
  ]);
  const byStage = new Map(counts.map((c) => [c.stageId, c._count._all]));
  return pipelines.map((p) => {
    const stages = p.stages.map((s) => ({ ...s, count: byStage.get(s.id) ?? 0 }));
    return { id: p.id, name: p.name, position: p.position, total: stages.reduce((sum, s) => sum + s.count, 0), stages };
  });
}

/** Stage counts for one pipeline restricted to contacts matching `contactWhere` (the list's filters). */
export async function stageCountsFor(workspaceId: string, pipelineId: string, contactWhere?: Prisma.ContactWhereInput): Promise<Map<string, number>> {
  const rows = await prisma.pipelineEntry.groupBy({
    by: ["stageId"],
    where: { workspaceId, pipelineId, ...(contactWhere ? { contact: contactWhere } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.stageId, r._count._all]));
}

async function requirePipeline(workspaceId: string, pipelineId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, workspaceId },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  if (!pipeline) throw new ApiError(404, "Pipeline not found", "NOT_FOUND");
  return pipeline;
}

/** Throws unless the stage belongs to the pipeline and the pipeline to the workspace. */
export async function requireStage(workspaceId: string, pipelineId: string, stageId: string): Promise<{ pipelineName: string; stage: PipelineStage }> {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId, pipeline: { workspaceId } },
    include: { pipeline: { select: { name: true } } },
  });
  if (!stage) throw new ApiError(422, "That stage isn't part of this pipeline", "UNKNOWN_STAGE");
  const { pipeline, ...rest } = stage;
  return { pipelineName: pipeline.name, stage: rest };
}

/** Pipelines a contact is in, first pipeline first. */
export async function pipelinesForContact(workspaceId: string, contactId: string): Promise<ContactPipelineRef[]> {
  const entries = await prisma.pipelineEntry.findMany({
    where: { workspaceId, contactId },
    select: {
      updatedAt: true,
      pipeline: { select: { id: true, name: true, position: true } },
      stage: { select: { id: true, name: true, color: true, position: true } },
    },
    orderBy: [{ pipeline: { position: "asc" } }, { createdAt: "asc" }],
  });
  return entries.map((e) => ({
    pipelineId: e.pipeline.id,
    pipelineName: e.pipeline.name,
    stageId: e.stage.id,
    stageName: e.stage.name,
    stageColor: e.stage.color,
    stagePosition: e.stage.position,
    updatedAt: e.updatedAt.toISOString(),
  }));
}

// ───────────────────────── Pipeline CRUD ─────────────────────────

export async function createPipeline(workspaceId: string, input: CreatePipelineInput, actorId?: string | null): Promise<PipelineSummary> {
  const data = createPipelineSchema.parse(input);
  const slots = await checkWorkspaceLimit(workspaceId, "pipelinesPerWorkspace");
  const count = slots.used;
  if (!slots.ok) {
    throw new ApiError(403, `Your plan allows ${slots.limit} pipeline${slots.limit === 1 ? "" : "s"} per workspace. Upgrade to add more.`, "PLAN_LIMIT");
  }
  if (count >= MAX_PIPELINES_PER_WORKSPACE) {
    throw new ApiError(422, `A workspace can have up to ${MAX_PIPELINES_PER_WORKSPACE} pipelines`, "PIPELINE_LIMIT");
  }
  const stages = data.stages ?? DEFAULT_STAGES.map((s) => ({ name: s.name, color: s.color }));
  try {
    const pipeline = await prisma.pipeline.create({
      data: {
        workspaceId,
        name: data.name,
        position: count,
        stages: { create: stages.map((s, position) => ({ name: s.name.trim(), color: s.color, position })) },
      },
    });
    await recordAudit({ workspaceId, userId: actorId, action: "pipeline.created", targetType: "pipeline", targetId: pipeline.id, metadata: { name: data.name } });
    return (await listPipelines(workspaceId)).find((p) => p.id === pipeline.id) as PipelineSummary;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "A pipeline with that name already exists", "DUPLICATE_PIPELINE");
    }
    throw err;
  }
}

/**
 * Renames the pipeline and/or replaces its stage list in one transaction:
 * existing stages (by id) are renamed, recoloured and reordered in place so
 * their contacts stay put; new stages are created; removed stages hand their
 * contacts to `moveRemovedTo` or the first stage, then are deleted.
 */
export async function updatePipeline(workspaceId: string, pipelineId: string, input: UpdatePipelineInput, actorId?: string | null): Promise<PipelineSummary> {
  const data = updatePipelineSchema.parse(input);
  const pipeline = await requirePipeline(workspaceId, pipelineId);

  try {
    const moved = await prisma.$transaction(async (tx) => {
      if (data.name !== undefined && data.name !== pipeline.name) {
        await tx.pipeline.update({ where: { id: pipelineId }, data: { name: data.name } });
      }
      if (!data.stages) return 0;

      const existingIds = new Set(pipeline.stages.map((s) => s.id));
      const keptIds = new Set(data.stages.map((s) => s.id).filter((id): id is string => Boolean(id && existingIds.has(id))));
      const removed = pipeline.stages.filter((s) => !keptIds.has(s.id));

      // Park every kept stage on a temporary name first so a swap (A↔B) can't trip the unique index mid-update.
      for (const stage of pipeline.stages) {
        if (keptIds.has(stage.id)) await tx.pipelineStage.update({ where: { id: stage.id }, data: { name: `__renaming_${stage.id}` } });
      }

      const finalIds: string[] = [];
      for (const [position, stage] of data.stages.entries()) {
        if (stage.id && keptIds.has(stage.id)) {
          await tx.pipelineStage.update({ where: { id: stage.id }, data: { name: stage.name.trim(), color: stage.color, position } });
          finalIds.push(stage.id);
        } else {
          const created = await tx.pipelineStage.create({ data: { pipelineId, name: stage.name.trim(), color: stage.color, position } });
          finalIds.push(created.id);
        }
      }

      let movedCount = 0;
      if (removed.length > 0) {
        const byName = new Map(data.stages.map((s, i) => [s.name.trim().toLowerCase(), finalIds[i]]));
        const target =
          (data.moveRemovedTo && (finalIds.includes(data.moveRemovedTo) ? data.moveRemovedTo : byName.get(data.moveRemovedTo.trim().toLowerCase()))) ||
          finalIds[0];
        const res = await tx.pipelineEntry.updateMany({
          where: { pipelineId, stageId: { in: removed.map((s) => s.id) } },
          data: { stageId: target },
        });
        movedCount = res.count;
        await tx.pipelineStage.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } });
      }
      return movedCount;
    });

    await recordAudit({
      workspaceId,
      userId: actorId,
      action: "pipeline.updated",
      targetType: "pipeline",
      targetId: pipelineId,
      metadata: { name: data.name ?? pipeline.name, stages: data.stages?.map((s) => s.name) ?? null, movedContacts: moved },
    });
    logger.info("pipeline.updated", { workspaceId, pipelineId, moved });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "A pipeline with that name already exists", "DUPLICATE_PIPELINE");
    }
    throw err;
  }
  return (await listPipelines(workspaceId)).find((p) => p.id === pipelineId) as PipelineSummary;
}

/** Deletes the pipeline. Contacts stay; only their place in this pipeline goes. */
export async function deletePipeline(workspaceId: string, pipelineId: string, actorId?: string | null): Promise<void> {
  const pipeline = await requirePipeline(workspaceId, pipelineId);
  await prisma.pipeline.delete({ where: { id: pipelineId } });
  await recordAudit({ workspaceId, userId: actorId, action: "pipeline.deleted", targetType: "pipeline", targetId: pipelineId, metadata: { name: pipeline.name } });
  logger.info("pipeline.deleted", { workspaceId, pipelineId });
}

// ───────────────────────── Contact moves ─────────────────────────

function stageAudit(
  workspaceId: string,
  contactId: string,
  source: StageMoveSource,
  meta: { pipelineId: string; pipeline: string; from: string | null; to: string; toPosition: number },
): Prisma.AuditLogCreateManyInput {
  return {
    workspaceId,
    userId: source.actorId ?? null,
    action: AUDIT_STAGE_CHANGED,
    targetType: "contact",
    targetId: contactId,
    metadata: { ...meta, ...(source.automationId ? { automationId: source.automationId } : {}) },
  };
}

/**
 * Puts contacts at a stage, adding them to the pipeline where they aren't in it.
 * With `onlyIfAbsent`, contacts already in the pipeline keep their stage (the
 * "Add to pipeline" step). Returns how many contacts actually moved or entered.
 */
export async function setContactsStage(
  workspaceId: string,
  contactIds: string[],
  pipelineId: string,
  stageId: string,
  source: StageMoveSource = {},
  opts: { onlyIfAbsent?: boolean } = {},
): Promise<{ updated: number }> {
  const ids = Array.from(new Set(contactIds)).slice(0, BULK_MAX_IDS);
  if (ids.length === 0) return { updated: 0 };
  const { pipelineName, stage } = await requireStage(workspaceId, pipelineId, stageId);

  const [contacts, entries] = await Promise.all([
    prisma.contact.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true } }),
    prisma.pipelineEntry.findMany({ where: { workspaceId, pipelineId, contactId: { in: ids } }, select: { id: true, contactId: true, stageId: true, stage: { select: { name: true } } } }),
  ]);
  const entryByContact = new Map(entries.map((e) => [e.contactId, e]));
  const toCreate = contacts.filter((c) => !entryByContact.has(c.id)).map((c) => c.id);
  const toMove = opts.onlyIfAbsent ? [] : entries.filter((e) => e.stageId !== stageId);
  if (toCreate.length === 0 && toMove.length === 0) return { updated: 0 };

  const audits = [
    ...toCreate.map((contactId) => stageAudit(workspaceId, contactId, source, { pipelineId, pipeline: pipelineName, from: null, to: stage.name, toPosition: stage.position })),
    ...toMove.map((e) => stageAudit(workspaceId, e.contactId, source, { pipelineId, pipeline: pipelineName, from: e.stage.name, to: stage.name, toPosition: stage.position })),
  ];

  await prisma.$transaction([
    prisma.pipelineEntry.createMany({ data: toCreate.map((contactId) => ({ workspaceId, pipelineId, stageId, contactId })), skipDuplicates: true }),
    prisma.pipelineEntry.updateMany({ where: { id: { in: toMove.map((e) => e.id) } }, data: { stageId } }),
    prisma.auditLog.createMany({ data: audits }),
  ]);
  logger.info("pipeline.contacts_staged", { workspaceId, pipelineId, stageId, added: toCreate.length, moved: toMove.length });
  return { updated: toCreate.length + toMove.length };
}

/** Takes contacts out of a pipeline. Their other pipelines are untouched. */
export async function removeContactsFromPipeline(workspaceId: string, contactIds: string[], pipelineId: string, source: StageMoveSource = {}): Promise<{ removed: number }> {
  const ids = Array.from(new Set(contactIds)).slice(0, BULK_MAX_IDS);
  if (ids.length === 0) return { removed: 0 };
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId }, select: { name: true } });
  if (!pipeline) throw new ApiError(404, "Pipeline not found", "NOT_FOUND");

  const entries = await prisma.pipelineEntry.findMany({
    where: { workspaceId, pipelineId, contactId: { in: ids } },
    select: { id: true, contactId: true, stage: { select: { name: true } } },
  });
  if (entries.length === 0) return { removed: 0 };

  await prisma.$transaction([
    prisma.pipelineEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } }),
    prisma.auditLog.createMany({
      data: entries.map((e) => ({
        workspaceId,
        userId: source.actorId ?? null,
        action: AUDIT_PIPELINE_REMOVED,
        targetType: "contact",
        targetId: e.contactId,
        metadata: { pipelineId, pipeline: pipeline.name, from: e.stage.name, ...(source.automationId ? { automationId: source.automationId } : {}) },
      })),
    }),
  ]);
  return { removed: entries.length };
}

/** Tolerant colour read for rows written before colours were validated. */
export function safeStageColor(color: string): string {
  return isStageColor(color) ? color : "gray";
}
