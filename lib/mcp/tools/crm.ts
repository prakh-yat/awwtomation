/**
 * Pipelines and saved segments as tools: the Pipelines tab and the segment
 * menu on the contacts page.
 */
import { ChannelPlatform, ContactSource } from "@prisma/client";
import { z } from "zod";

import { STAGE_COLORS } from "@/lib/pipelines/colors";
import { contactSortSchema, listContacts } from "@/lib/services/contacts";
import { createPipeline, createPipelineSchema, deletePipeline, listPipelines, updatePipeline, updatePipelineSchema } from "@/lib/services/pipelines";
import {
  countContacts,
  createSegment,
  createSegmentSchema,
  deleteSegment,
  getSegment,
  listSegments,
  previewSegmentSchema,
  segmentFiltersSchema,
  updateSegment,
  updateSegmentSchema,
} from "@/lib/services/segments";
import { ApiError } from "@/lib/workspace/api";

import { compact, workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const pipelineId = z.string().describe("Pipeline id from list_pipelines.");
const segmentId = z.string().describe("Segment id from list_segments.");

const stageInput = z.object({
  id: z.string().optional().describe("An existing stage's id, to keep its contacts through a rename. Leave out for a new stage."),
  name: z.string().describe("Up to 24 characters."),
  color: z.enum(STAGE_COLORS),
});

/** The one filter vocabulary segments and broadcasts share. */
const segmentFilters = z
  .object({
    q: z.string().max(120).optional().describe("Name, @username or email contains."),
    channelId: z.string().optional(),
    platform: z.nativeEnum(ChannelPlatform).optional(),
    tags: z.array(z.string()).max(50).optional(),
    tagMode: z.enum(["all", "any"]).optional().describe("all (default) or any of tags."),
    excludeTags: z.array(z.string()).max(50).optional(),
    onlyFollowers: z.boolean().optional(),
    excludeFollowers: z.boolean().optional().describe("People not known to follow."),
    lastInteractionDays: z.number().int().min(1).max(365).optional(),
    excludeOptedOut: z.boolean().optional(),
    optedOut: z.boolean().optional(),
    pipelineId: z.string().optional(),
    stageId: z.string().optional(),
    ownerId: z.string().optional().describe('A teammate\'s userId or "unassigned".'),
    source: z.nativeEnum(ContactSource).optional(),
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    messageable: z.boolean().optional(),
  })
  .describe("Who is in the segment. Every filter given must match.");

export const crmTools = [
  // ───────────────────────── Pipelines ─────────────────────────

  workspaceTool({
    name: "list_pipelines",
    title: "List pipelines",
    description: "Pipelines with their stages (ids, names, colours) and how many contacts are at each stage. Flow steps and contact tools take these ids.",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => ({ pipelines: await listPipelines(ctx.workspace.id) }),
  }),

  workspaceTool({
    name: "create_pipeline",
    title: "Create a pipeline",
    description: "Add a pipeline, such as Leads or Orders. Without stages it starts with the default ones. 2 to 12 stages with unique names. Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: { name: z.string().describe("Up to 40 characters."), stages: z.array(stageInput).optional() },
    run: async (args, ctx) => ({ pipeline: await createPipeline(ctx.workspace.id, createPipelineSchema.parse(compact(args)), ctx.user.id) }),
  }),

  workspaceTool({
    name: "update_pipeline",
    title: "Update a pipeline",
    description:
      "Rename a pipeline or replace its stage list (in order). Keep a stage's id to keep its contacts; contacts in a stage you drop move to moveRemovedTo or the first stage. Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: {
      pipelineId,
      name: z.string().optional(),
      stages: z.array(stageInput).optional().describe("The complete new list of stages, in order."),
      moveRemovedTo: z.string().optional().describe("Stage id (or a new stage's name) for contacts in removed stages."),
    },
    run: async (args, ctx) => {
      const { pipelineId: id, ...fields } = args;
      return { pipeline: await updatePipeline(ctx.workspace.id, id, updatePipelineSchema.parse(compact(fields)), ctx.user.id) };
    },
  }),

  workspaceTool({
    name: "delete_pipeline",
    title: "Delete a pipeline",
    description: "Delete a pipeline. Its contacts stay in the workspace. Admins and owners. Confirm with the person first.",
    minRole: "ADMIN",
    annotations: DESTROY,
    input: { pipelineId },
    run: async (args, ctx) => {
      await deletePipeline(ctx.workspace.id, args.pipelineId, ctx.user.id);
      return { ok: true };
    },
  }),

  // ───────────────────────── Segments ─────────────────────────

  workspaceTool({
    name: "list_segments",
    title: "List segments",
    description: "Saved segments (filtered lists of contacts) with their filters and live counts. Broadcasts can target a segment.",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => ({ segments: await listSegments(ctx.workspace.id) }),
  }),

  workspaceTool({
    name: "count_segment",
    title: "Count contacts for filters",
    description: "How many contacts match a set of segment filters right now, without saving anything.",
    annotations: READ,
    input: { filters: segmentFilters },
    run: async (args, ctx) => {
      const { filters } = previewSegmentSchema.parse({ filters: compact(args.filters) });
      return { count: await countContacts(ctx.workspace.id, filters) };
    },
  }),

  workspaceTool({
    name: "create_segment",
    title: "Save a segment",
    description: "Save a filtered list of contacts under a name, for the contacts page and for broadcasts.",
    annotations: WRITE,
    input: { name: z.string().describe("Unique in the workspace, up to 60 characters."), description: z.string().nullable().optional(), filters: segmentFilters },
    run: async (args, ctx) => {
      const input = createSegmentSchema.parse(compact({ ...args, filters: compact(args.filters) }));
      return { segment: await createSegment(ctx.workspace.id, input, ctx.user.id) };
    },
  }),

  workspaceTool({
    name: "update_segment",
    title: "Update a segment",
    description: "Rename a segment, change its description or replace its filters.",
    annotations: WRITE,
    input: { segmentId, name: z.string().optional(), description: z.string().nullable().optional(), filters: segmentFilters.optional() },
    run: async (args, ctx) => {
      const { segmentId: id, filters, ...fields } = args;
      const input = updateSegmentSchema.parse(compact({ ...fields, filters: filters ? segmentFiltersSchema.parse(compact(filters)) : undefined }));
      return { segment: await updateSegment(ctx.workspace.id, id, input, ctx.user.id) };
    },
  }),

  workspaceTool({
    name: "delete_segment",
    title: "Delete a segment",
    description: "Delete a saved segment. Broadcasts that used it keep their own copy of its filters.",
    annotations: DESTROY,
    input: { segmentId },
    run: async (args, ctx) => {
      await deleteSegment(ctx.workspace.id, args.segmentId, ctx.user.id);
      return { ok: true };
    },
  }),

  workspaceTool({
    name: "list_segment_contacts",
    title: "List a segment's contacts",
    description: "The contacts in a saved segment right now, a page at a time.",
    annotations: READ,
    input: {
      segmentId,
      cursor: z.string().max(512).optional().describe("nextCursor from the previous page."),
      limit: z.number().int().min(1).max(100).optional(),
      sort: contactSortSchema.optional(),
    },
    run: async (args, ctx) => {
      const segment = await getSegment(ctx.workspace.id, args.segmentId);
      if (!segment) throw new ApiError(404, "Segment not found", "NOT_FOUND");
      return listContacts(ctx.workspace.id, { ...segment.filters, ...compact({ cursor: args.cursor, limit: args.limit }), sort: args.sort ?? "recent" });
    },
  }),
];

export { segmentFilters };
