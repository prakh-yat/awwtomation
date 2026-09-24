/**
 * Contacts as tools: the table and its filters, a contact's profile, bulk
 * edits, tags, notes and CSV import and export. Every input goes through the
 * same schema as the matching API route.
 */
import { ChannelPlatform, ContactSource } from "@prisma/client";
import { z } from "zod";

import { addNote, createNoteSchema, deleteNote, updateNote, updateNoteSchema } from "@/lib/services/contact-notes";
import { importPreviewSchema, importRunSchema, previewImport, runImport } from "@/lib/services/contact-import";
import {
  addTags,
  bulkIdsSchema,
  bulkUpdateSchema,
  contactListQuerySchema,
  createManualContact,
  createManualContactSchema,
  deleteContacts,
  deleteTag,
  deleteTagSchema,
  exportContactsCsv,
  getContact,
  listContacts,
  listTags,
  removeTags,
  renameTag,
  renameTagSchema,
  resolveOwnerFilter,
  setOwner,
  updateContact,
  updateContactSchema,
} from "@/lib/services/contacts";
import { removeContactsFromPipeline, setContactsStage } from "@/lib/services/pipelines";
import { ApiError } from "@/lib/workspace/api";
import type { WorkspaceContext } from "@/lib/workspace/context";

import { compact, workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const contactId = z.string().describe("Contact id from list_contacts.");

/** The contacts page's filters. Tags and booleans are sent the way the page's query string carries them. */
export const contactFilterFields = {
  q: z.string().max(120).optional().describe("Search name, @username or email."),
  channelId: z.string().optional().describe("Only contacts from this account."),
  platform: z.nativeEnum(ChannelPlatform).optional(),
  tags: z.array(z.string()).max(20).optional().describe("Contacts carrying these tags (see tagMode)."),
  tagMode: z.enum(["all", "any"]).optional().describe("all (default): every tag; any: at least one."),
  excludeTags: z.array(z.string()).max(20).optional().describe("Contacts carrying none of these."),
  follower: z.boolean().optional().describe("true: only followers; false: only people not known to follow."),
  lastInteractionDays: z.number().int().min(1).max(365).optional().describe("Interacted within the last N days."),
  excludeOptedOut: z.boolean().optional().describe("Leave out people who opted out of messages."),
  optedOut: z.boolean().optional(),
  pipelineId: z.string().optional().describe("In this pipeline (from list_pipelines)."),
  stageId: z.string().optional().describe("At this stage."),
  ownerId: z.string().optional().describe('"me", "unassigned" or a teammate\'s userId.'),
  source: z.nativeEnum(ContactSource).optional().describe("WEBHOOK (came in from Instagram or Facebook), IMPORT or MANUAL."),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  messageable: z.boolean().optional().describe("true: can be messaged; false: CRM-only records."),
};

type FilterArgs = { [K in keyof typeof contactFilterFields]?: z.infer<(typeof contactFilterFields)[K]> };

const asQueryFlag = (value: boolean | undefined) => (value === undefined ? undefined : String(value));

/** The filters exactly as GET /api/contacts parses them, with ownerId "me" resolved to the caller. */
function contactQuery(args: FilterArgs & { page?: number; pageSize?: number; sort?: string }, ctx: WorkspaceContext) {
  const query = contactListQuerySchema.parse(
    compact({
      q: args.q,
      channelId: args.channelId,
      platform: args.platform,
      tags: args.tags?.join(","),
      tagMode: args.tagMode,
      excludeTags: args.excludeTags?.join(","),
      follower: asQueryFlag(args.follower),
      lastInteractionDays: args.lastInteractionDays,
      excludeOptedOut: asQueryFlag(args.excludeOptedOut),
      optedOut: asQueryFlag(args.optedOut),
      pipelineId: args.pipelineId,
      stageId: args.stageId,
      ownerId: args.ownerId,
      source: args.source,
      hasEmail: asQueryFlag(args.hasEmail),
      hasPhone: asQueryFlag(args.hasPhone),
      messageable: asQueryFlag(args.messageable),
      page: args.page,
      pageSize: args.pageSize,
      sort: args.sort,
    }),
  );
  return { ...query, ownerId: resolveOwnerFilter(query.ownerId, ctx.user.id) };
}

export const contactTools = [
  workspaceTool({
    name: "list_contacts",
    title: "List contacts",
    description: "Contacts with the contacts page's filters and sort, a page at a time. Each has tags, pipeline stages, owner, follower status and last interaction.",
    annotations: READ,
    input: {
      ...contactFilterFields,
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional().describe("Defaults to 50."),
      sort: z.enum(["recent", "newest", "name", "lastInteraction", "createdAt"]).optional().describe("Defaults to recent."),
    },
    run: async (args, ctx) => listContacts(ctx.workspace.id, contactQuery(args, ctx)),
  }),

  workspaceTool({
    name: "get_contact",
    title: "Get a contact",
    description: "A contact's full profile: fields, tags, custom fields, pipelines, owner, conversation, recent messages, deliveries, link clicks, notes and timeline.",
    annotations: READ,
    input: { contactId },
    run: async (args, ctx) => {
      const detail = await getContact(ctx.workspace.id, args.contactId);
      if (!detail) throw new ApiError(404, "Contact not found", "NOT_FOUND");
      return detail;
    },
  }),

  workspaceTool({
    name: "create_contact",
    title: "Add a contact",
    description: "Add a person by hand to an account's contacts, optionally at a pipeline stage and with tags. They become messageable once they comment or message the account.",
    annotations: WRITE,
    input: {
      channelId: z.string().describe("The account they belong to (channelId from list_accounts)."),
      name: z.string(),
      username: z.string().optional().describe("Their Instagram or Facebook @username, used to match them when they interact."),
      email: z.string().optional(),
      phone: z.string().optional(),
      pipelineId: z.string().optional().describe("Pass with stageId to add them to a pipeline."),
      stageId: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    run: async (args, ctx) => {
      const contact = await createManualContact(ctx.workspace.id, createManualContactSchema.parse(compact(args)), ctx.user.id);
      return { contact: { id: contact.id, name: contact.name, username: contact.username } };
    },
  }),

  workspaceTool({
    name: "update_contact",
    title: "Update a contact",
    description:
      "Change a contact's name, email, phone, owner, tags (replaces the list), custom fields (replaces the set) or opt-out. For pipeline stages use update_contacts.",
    annotations: WRITE,
    input: {
      contactId,
      name: z.string().nullable().optional(),
      email: z.string().nullable().optional().describe("Empty string or null clears it."),
      phone: z.string().nullable().optional().describe("Empty string or null clears it."),
      ownerId: z.string().nullable().optional().describe("A teammate's userId, or null to unassign."),
      tags: z.array(z.string()).optional().describe("The complete tag list."),
      customFields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe("The complete set of custom fields, such as { \"order_number\": \"1042\" }."),
      optedOut: z.boolean().optional().describe("true stops all automated and broadcast messages to them."),
    },
    run: async (args, ctx) => {
      const { contactId: id, ...fields } = args;
      await updateContact(ctx.workspace.id, id, updateContactSchema.parse(compact(fields)), ctx.user.id);
      return { ok: true };
    },
  }),

  workspaceTool({
    name: "update_contacts",
    title: "Bulk edit contacts",
    description:
      "Apply one or more changes to many contacts at once: put them at a pipeline stage (pipelineId with stageId), take them out of a pipeline, set or clear the owner, add tags, remove tags. Works for a single contact too.",
    annotations: WRITE,
    input: {
      contactIds: z.array(z.string()).min(1).max(500),
      pipelineId: z.string().optional().describe("With stageId: move them to that stage, adding them to the pipeline if needed."),
      stageId: z.string().optional(),
      removeFromPipelineId: z.string().optional(),
      ownerId: z.string().nullable().optional().describe("A teammate's userId, or null to unassign."),
      addTags: z.array(z.string()).optional(),
      removeTags: z.array(z.string()).optional(),
    },
    run: async (args, ctx) => {
      const { contactIds, ...changes } = args;
      const input = bulkUpdateSchema.parse(compact({ ids: contactIds, ...changes }));
      const workspaceId = ctx.workspace.id;
      const source = { actorId: ctx.user.id };
      const stage = input.pipelineId && input.stageId ? await setContactsStage(workspaceId, input.ids, input.pipelineId, input.stageId, source) : { updated: 0 };
      const left = input.removeFromPipelineId ? await removeContactsFromPipeline(workspaceId, input.ids, input.removeFromPipelineId, source) : { removed: 0 };
      const owner = input.ownerId !== undefined ? await setOwner(workspaceId, input.ids, input.ownerId) : { updated: 0 };
      const added = input.addTags?.length ? await addTags(workspaceId, input.ids, input.addTags) : { updated: 0 };
      const removed = input.removeTags?.length ? await removeTags(workspaceId, input.ids, input.removeTags) : { updated: 0 };
      return { stage: stage.updated, removedFromPipeline: left.removed, owner: owner.updated, tagsAdded: added.updated, tagsRemoved: removed.updated };
    },
  }),

  workspaceTool({
    name: "delete_contacts",
    title: "Delete contacts",
    description: "Delete contacts with their conversations and history. Cannot be undone. Confirm with the person first.",
    annotations: DESTROY,
    input: { contactIds: z.array(z.string()).min(1).max(500) },
    run: async (args, ctx) => deleteContacts(ctx.workspace.id, bulkIdsSchema.parse({ ids: args.contactIds }).ids),
  }),

  workspaceTool({
    name: "list_tags",
    title: "List tags",
    description: "Every tag in the workspace with how many contacts carry it, most used first.",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => ({ tags: await listTags(ctx.workspace.id) }),
  }),

  workspaceTool({
    name: "rename_tag",
    title: "Rename a tag",
    description: "Rename a tag on every contact that has it.",
    annotations: WRITE,
    input: { from: z.string(), to: z.string() },
    run: async (args, ctx) => {
      const { from, to } = renameTagSchema.parse(args);
      return renameTag(ctx.workspace.id, from, to);
    },
  }),

  workspaceTool({
    name: "delete_tag",
    title: "Delete a tag",
    description: "Remove a tag from every contact. Automations and broadcasts that use it stop matching anyone.",
    annotations: DESTROY,
    input: { tag: z.string() },
    run: async (args, ctx) => deleteTag(ctx.workspace.id, deleteTagSchema.parse(args).tag),
  }),

  workspaceTool({
    name: "add_contact_note",
    title: "Add a note to a contact",
    description: "Add a note to a contact's profile. Only the team sees notes.",
    annotations: WRITE,
    input: { contactId, body: z.string().describe("The note text.") },
    run: async (args, ctx) => {
      const { body } = createNoteSchema.parse({ body: args.body });
      return { note: await addNote(ctx.workspace.id, args.contactId, ctx.user.id, body) };
    },
  }),

  workspaceTool({
    name: "update_contact_note",
    title: "Edit a note",
    description: "Change a note's text. Its author or an admin can.",
    annotations: WRITE,
    input: { contactId, noteId: z.string().describe("From get_contact."), body: z.string() },
    run: async (args, ctx) => {
      const { body } = updateNoteSchema.parse({ body: args.body });
      return { note: await updateNote(ctx.workspace.id, args.noteId, { id: ctx.user.id, role: ctx.role }, body, args.contactId) };
    },
  }),

  workspaceTool({
    name: "delete_contact_note",
    title: "Delete a note",
    description: "Delete a note. Its author or an admin can.",
    annotations: DESTROY,
    input: { contactId, noteId: z.string().describe("From get_contact.") },
    run: async (args, ctx) => {
      await deleteNote(ctx.workspace.id, args.noteId, { id: ctx.user.id, role: ctx.role }, args.contactId);
      return { ok: true };
    },
  }),

  workspaceTool({
    name: "export_contacts",
    title: "Export contacts as CSV",
    description: "Contacts matching the filters as CSV text, one row per contact: the same file the contacts page downloads.",
    annotations: READ,
    input: { ...contactFilterFields },
    run: async (args, ctx) => exportContactsCsv(ctx.workspace.id, contactQuery(args, ctx)),
  }),

  workspaceTool({
    name: "preview_contact_import",
    title: "Preview a CSV import",
    description: "Read a CSV of contacts and suggest which column holds the name, @username, email, phone, stage and tags. Shows the first rows. Nothing is saved.",
    annotations: READ,
    input: { csv: z.string().describe("The CSV text with a header row. Up to 2 MB.") },
    run: async (args) => previewImport(importPreviewSchema.parse({ csv: args.csv }).csv),
  }),

  workspaceTool({
    name: "import_contacts",
    title: "Import contacts from CSV",
    description:
      "Import a CSV of contacts into an account. mapping gives each field's column index (0-based) or null; preview_contact_import suggests one. Optionally put everyone in a pipeline and tag them. Returns created, duplicates, invalid rows and why.",
    annotations: WRITE,
    input: {
      csv: z.string().describe("The CSV text with a header row. Up to 2 MB."),
      channelId: z.string().describe("The account the contacts belong to."),
      mapping: z
        .object({
          name: z.number().int().nullable().optional(),
          username: z.number().int().nullable().optional(),
          email: z.number().int().nullable().optional(),
          phone: z.number().int().nullable().optional(),
          stage: z.number().int().nullable().optional().describe("A column of stage names, used with pipelineId."),
          tags: z.number().int().nullable().optional().describe("A column of comma-separated tags."),
        })
        .describe("Column index per field. At least one of name, username, email or phone."),
      pipelineId: z.string().optional(),
      defaultStageId: z.string().optional().describe("Stage for rows without a known stage. Defaults to the pipeline's first stage."),
      addTags: z.array(z.string()).max(10).optional().describe("Added to every imported contact, such as imported-sept."),
    },
    run: async (args, ctx) => runImport(ctx.workspace.id, importRunSchema.parse(compact({ ...args, mapping: compact(args.mapping) })), ctx.user.id),
  }),
];
