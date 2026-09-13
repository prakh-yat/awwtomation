/**
 * CSV import for CRM contacts. Two calls, both stateless: `previewImport`
 * reads the header and a few rows so the user can map columns, then
 * `runImport` re-reads the same file with that mapping and writes the rows.
 *
 * Imported people have no Meta id, so they are stored like manual contacts
 * (`source: IMPORT`, `messageable: false`) and merge into the real contact
 * the first time they comment or message (see `adoptManualContact`).
 * Duplicates, by email across the workspace or by username on the chosen
 * account, are skipped rather than overwritten.
 */
import { randomUUID } from "node:crypto";

import { ContactSource, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  CONTACT_MAX_NAME_LENGTH,
  CONTACT_MAX_TAGS,
  normalizeEmail,
  normalizePhone,
  normalizeTags,
  normalizeUsername,
} from "@/lib/services/contacts";
import { AUDIT_STAGE_CHANGED } from "@/lib/services/pipelines";
import { PayloadTooLargeError, readBodyWithLimit } from "@/lib/security/body-limit";
import { recordAudit } from "@/lib/services/audit";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── Limits ─────────────────────────

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
const PREVIEW_ROWS = 5;
const MAX_COLUMNS = 60;
const MAX_REPORTED_ERRORS = 20;
const MAX_TAG_LENGTH = 50;
const INSERT_CHUNK = 500;

export const IMPORT_FIELDS = ["name", "username", "email", "phone", "stage", "tags"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

// ───────────────────────── Validation ─────────────────────────

const csvTextSchema = z
  .string()
  .min(1, "The file is empty")
  .max(IMPORT_MAX_BYTES, "Files can be up to 2 MB. Split larger lists into several files.");

export const importPreviewSchema = z.object({ csv: csvTextSchema }).strict();

const columnIndex = z.number().int().min(0).max(MAX_COLUMNS - 1).nullable();

export const importRunSchema = z
  .object({
    csv: csvTextSchema,
    channelId: z.string().min(1).max(64),
    mapping: z
      .object({
        name: columnIndex.default(null),
        username: columnIndex.default(null),
        email: columnIndex.default(null),
        phone: columnIndex.default(null),
        stage: columnIndex.default(null),
        tags: columnIndex.default(null),
      })
      .strict()
      .refine((m) => m.name !== null || m.username !== null || m.email !== null || m.phone !== null, {
        message: "Match at least one of name, username, email or phone",
      }),
    /** Optional: put every imported contact in this pipeline. A mapped stage column picks each row's stage by name. */
    pipelineId: z.string().min(1).max(64).optional(),
    /** Used when a row has no stage, or one that isn't in the pipeline. Defaults to the first stage. */
    defaultStageId: z.string().min(1).max(64).optional(),
    /** Added to every imported contact, e.g. "imported-sept". */
    addTags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH)).max(10).default([]),
  })
  .strict();

export type ImportRunInput = z.infer<typeof importRunSchema>;
export type ImportMapping = ImportRunInput["mapping"];

export type ImportPreview = {
  headers: string[];
  rows: string[][];
  rowCount: number;
  mapping: ImportMapping;
};

export type ImportRowError = { row: number; reason: string };

export type ImportResult = {
  created: number;
  duplicates: number;
  invalid: number;
  errors: ImportRowError[];
};

/**
 * Reads an import request body with a hard size cap before any JSON parsing,
 * so a huge upload is refused without being buffered whole.
 */
export async function readImportBody(req: Request): Promise<unknown> {
  let text: string;
  try {
    // The CSV travels as a JSON string, which escaping can grow; leave headroom above the file limit.
    text = await readBodyWithLimit(req, IMPORT_MAX_BYTES * 2 + 64 * 1024);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) throw new ApiError(413, "Files can be up to 2 MB. Split larger lists into several files.", "IMPORT_TOO_LARGE");
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Request body must be valid JSON", "BAD_JSON");
  }
}

// ───────────────────────── CSV parsing ─────────────────────────

/** Picks the delimiter that splits the header line into the most columns. */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC 4180 parser: quoted fields, doubled quotes, delimiters and newlines
 * inside quotes, CRLF or LF line endings, and a leading UTF-8 BOM. Blank
 * lines are dropped.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function readTable(csv: string): { headers: string[]; body: string[][] } {
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new ApiError(422, "The file is empty", "IMPORT_EMPTY");
  const headers = rows[0].slice(0, MAX_COLUMNS).map((h, i) => h.trim() || `Column ${i + 1}`);
  const body = rows.slice(1);
  if (body.length === 0) throw new ApiError(422, "The file has a header row but no contacts", "IMPORT_EMPTY");
  if (body.length > IMPORT_MAX_ROWS) {
    throw new ApiError(422, `Files can have up to ${IMPORT_MAX_ROWS.toLocaleString("en-US")} contacts. Split the list into smaller files.`, "IMPORT_TOO_MANY_ROWS");
  }
  return { headers, body };
}

// ───────────────────────── Column matching ─────────────────────────

const HEADER_HINTS: Record<ImportField, RegExp> = {
  name: /^(full[\s_-]*name|name|contact[\s_-]*name|customer[\s_-]*name|first[\s_-]*name)$/i,
  username: /^(user[\s_-]*name|handle|instagram|ig|insta|instagram[\s_-]*(handle|username)|@)$/i,
  email: /^(e-?mail|e-?mail[\s_-]*address)$/i,
  phone: /^(phone|phone[\s_-]*number|mobile|mobile[\s_-]*number|contact[\s_-]*number|whats[\s_-]*app|cell)$/i,
  stage: /^(stage|status|pipeline[\s_-]*stage|lifecycle)$/i,
  tags: /^(tags?|labels?|groups?)$/i,
};

/** Best-guess mapping from header names; each column is used at most once. */
export function suggestMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = { name: null, username: null, email: null, phone: null, stage: null, tags: null };
  const taken = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const index = headers.findIndex((h, i) => !taken.has(i) && HEADER_HINTS[field].test(h.trim()));
    if (index !== -1) {
      mapping[field] = index;
      taken.add(index);
    }
  }
  return mapping;
}

// ───────────────────────── Preview ─────────────────────────

export function previewImport(csv: string): ImportPreview {
  const { headers, body } = readTable(csv);
  return {
    headers,
    rows: body.slice(0, PREVIEW_ROWS).map((r) => headers.map((_, i) => (r[i] ?? "").trim())),
    rowCount: body.length,
    mapping: suggestMapping(headers),
  };
}

// ───────────────────────── Import ─────────────────────────

type Candidate = {
  row: number;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  stageId: string | null;
  tags: string[];
};

function cell(row: string[], index: number | null): string {
  return index === null ? "" : (row[index] ?? "").trim();
}

export async function runImport(workspaceId: string, input: ImportRunInput, actorId: string): Promise<ImportResult> {
  const data = importRunSchema.parse(input);
  const channel = await prisma.channel.findFirst({ where: { id: data.channelId, workspaceId }, select: { id: true, platform: true } });
  if (!channel) throw new ApiError(404, "That account isn't connected to this workspace", "NOT_FOUND");

  const { body } = readTable(data.csv);
  const pipeline = data.pipelineId
    ? await prisma.pipeline.findFirst({
        where: { id: data.pipelineId, workspaceId },
        select: { id: true, name: true, stages: { orderBy: { position: "asc" }, select: { id: true, name: true, position: true } } },
      })
    : null;
  if (data.pipelineId && !pipeline) throw new ApiError(404, "That pipeline doesn't exist in this workspace", "NOT_FOUND");
  const stageByKey = new Map((pipeline?.stages ?? []).map((st) => [st.name.toLowerCase(), st]));
  const fallbackStage = pipeline ? (pipeline.stages.find((st) => st.id === data.defaultStageId) ?? pipeline.stages[0] ?? null) : null;
  const extraTags = normalizeTags(data.addTags);

  const errors: ImportRowError[] = [];
  let invalid = 0;
  const reject = (row: number, reason: string) => {
    invalid++;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push({ row, reason });
  };

  const candidates: Candidate[] = [];
  body.forEach((raw, i) => {
    // Row numbers as a spreadsheet shows them: the header is row 1.
    const rowNumber = i + 2;
    const emailRaw = cell(raw, data.mapping.email);
    const phoneRaw = cell(raw, data.mapping.phone);
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (emailRaw && !email) return reject(rowNumber, `“${emailRaw.slice(0, 60)}” isn't a valid email`);
    if (phoneRaw && !phone) return reject(rowNumber, `“${phoneRaw.slice(0, 32)}” isn't a valid phone number`);

    const username = normalizeUsername(cell(raw, data.mapping.username));
    const name = cell(raw, data.mapping.name).slice(0, CONTACT_MAX_NAME_LENGTH) || null;
    if (!name && !username && !email && !phone) return reject(rowNumber, "No name, username, email or phone");

    const stageId = pipeline ? (stageByKey.get(cell(raw, data.mapping.stage).toLowerCase()) ?? fallbackStage)?.id ?? null : null;
    const rowTags = cell(raw, data.mapping.tags)
      .split(/[;,|]/)
      .map((t) => t.trim().slice(0, MAX_TAG_LENGTH));
    const tags = normalizeTags([...rowTags, ...extraTags]).slice(0, CONTACT_MAX_TAGS);

    candidates.push({ row: rowNumber, name, username, email, phone, stageId, tags });
  });

  // Duplicates inside the file, then against what the workspace already has.
  const seenEmails = new Set<string>();
  const seenUsernames = new Set<string>();
  let duplicates = 0;
  const unique = candidates.filter((c) => {
    const handle = c.username?.toLowerCase();
    if ((c.email && seenEmails.has(c.email)) || (handle && seenUsernames.has(handle))) {
      duplicates++;
      return false;
    }
    if (c.email) seenEmails.add(c.email);
    if (handle) seenUsernames.add(handle);
    return true;
  });

  const emails = [...seenEmails];
  const handles = [...seenUsernames];
  const [existingEmails, existingHandles] = await Promise.all([
    emails.length
      ? prisma.contact.findMany({ where: { workspaceId, email: { in: emails } }, select: { email: true } })
      : Promise.resolve([] as Array<{ email: string | null }>),
    handles.length
      ? prisma.$queryRaw<Array<{ handle: string }>>(Prisma.sql`
          SELECT lower("username") AS handle FROM "Contact"
          WHERE "workspaceId" = ${workspaceId} AND "channelId" = ${channel.id} AND lower("username") = ANY(${handles}::text[])
        `)
      : Promise.resolve([] as Array<{ handle: string }>),
  ]);
  const takenEmails = new Set(existingEmails.map((r) => r.email));
  const takenHandles = new Set(existingHandles.map((r) => r.handle));

  const now = new Date();
  const rows: Prisma.ContactCreateManyInput[] = [];
  const stageForExternalId = new Map<string, string>();
  for (const c of unique) {
    if ((c.email && takenEmails.has(c.email)) || (c.username && takenHandles.has(c.username.toLowerCase()))) {
      duplicates++;
      continue;
    }
    // Placeholder until the person interacts; unique per row so the (channelId, externalId) index holds.
    const externalId = `import:${randomUUID()}`;
    if (c.stageId) stageForExternalId.set(externalId, c.stageId);
    rows.push({
      workspaceId,
      channelId: channel.id,
      platform: channel.platform,
      externalId,
      username: c.username,
      name: c.name ?? c.username ?? c.email?.split("@")[0] ?? null,
      email: c.email,
      phone: c.phone,
      tags: c.tags,
      source: ContactSource.IMPORT,
      messageable: false,
      firstSeenAt: now,
    });
  }

  let created = 0;
  const stagePositions = new Map((pipeline?.stages ?? []).map((st) => [st.id, st]));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const inserted = await prisma.contact.createManyAndReturn({ data: rows.slice(i, i + INSERT_CHUNK), skipDuplicates: true, select: { id: true, externalId: true } });
    created += inserted.length;
    if (!pipeline) continue;
    const placed = inserted
      .map((row) => ({ contactId: row.id, stageId: stageForExternalId.get(row.externalId) }))
      .filter((row): row is { contactId: string; stageId: string } => Boolean(row.stageId));
    if (placed.length === 0) continue;
    await prisma.$transaction([
      prisma.pipelineEntry.createMany({ data: placed.map((row) => ({ workspaceId, pipelineId: pipeline.id, stageId: row.stageId, contactId: row.contactId })), skipDuplicates: true }),
      prisma.auditLog.createMany({
        data: placed.map((row) => {
          const stage = stagePositions.get(row.stageId);
          return {
            workspaceId,
            userId: actorId,
            action: AUDIT_STAGE_CHANGED,
            targetType: "contact",
            targetId: row.contactId,
            metadata: { pipelineId: pipeline.id, pipeline: pipeline.name, from: null, to: stage?.name ?? "", toPosition: stage?.position ?? 0 },
          };
        }),
      }),
    ]);
  }
  // A concurrent import can claim the same person between the checks and the insert; those rows are skipped by the unique index.
  duplicates += rows.length - created;

  await recordAudit({
    workspaceId,
    userId: actorId,
    action: "contact.import",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { channelId: channel.id, pipelineId: pipeline?.id ?? null, rows: body.length, created, duplicates, invalid },
  });
  logger.info("contact.imported", { workspaceId, channelId: channel.id, rows: body.length, created, duplicates, invalid });
  return { created, duplicates, invalid, errors };
}
