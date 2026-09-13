import { clientErrorMessage } from "@/lib/errors/customer-messages";
import type { ContactNoteSummary } from "@/lib/services/contact-notes";
import type { ImportMapping, ImportPreview, ImportResult } from "@/lib/services/contact-import";
import type { BulkUpdateInput, ContactListResult, ContactOwner, ContactTagCount, CreateManualContactInput, UpdateContactInput } from "@/lib/services/contacts";
import type { ContactPipelineRef, CreatePipelineInput, PipelineSummary, UpdatePipelineInput } from "@/lib/services/pipelines";
import type { SegmentFilters, SegmentSummary } from "@/lib/services/segments";

import { type ContactFilterState, filtersToSearchParams } from "./filters";

export type { ContactFilterState } from "./filters";
export { EMPTY_FILTERS, filtersToSearchParams, hasActiveFilters, hasRefiningFilters } from "./filters";

/** Thrown for non-2xx responses; `message` is the server's `error` field so it can go straight into a toast. */
export class ContactsApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ContactsApiError";
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Empty or non-JSON body; handled below.
  }
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; code?: string };
    throw new ContactsApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code);
  }
  return body as T;
}

/** Thin client for app/api/contacts/*. Every method resolves to the JSON body or throws ContactsApiError. */
export const contactsApi = {
  list(filters: ContactFilterState, opts: { page?: number; pageSize?: number; signal?: AbortSignal } = {}): Promise<ContactListResult> {
    const params = filtersToSearchParams(filters);
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    if (opts.pageSize) params.set("pageSize", String(opts.pageSize));
    return request<ContactListResult>(`/api/contacts?${params.toString()}`, { signal: opts.signal });
  },
  tags(): Promise<ContactTagCount[]> {
    return request<{ tags: ContactTagCount[] }>("/api/contacts/tags").then((r) => r.tags);
  },
  update(id: string, data: UpdateContactInput): Promise<void> {
    return request<{ ok: true }>(`/api/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }).then(() => undefined);
  },
  create(input: CreateManualContactInput): Promise<{ id: string }> {
    return request<{ contact: { id: string } }>("/api/contacts", { method: "POST", body: JSON.stringify(input) }).then((r) => r.contact);
  },
  bulkUpdate(input: BulkUpdateInput): Promise<{ stage: number; removedFromPipeline: number; owner: number; tagsAdded: number; tagsRemoved: number }> {
    return request("/api/contacts/bulk", { method: "POST", body: JSON.stringify(input) });
  },
  owners(): Promise<ContactOwner[]> {
    return request<{ owners: ContactOwner[] }>("/api/contacts/owners").then((r) => r.owners);
  },
  addNote(contactId: string, body: string): Promise<ContactNoteSummary> {
    return request<{ note: ContactNoteSummary }>(`/api/contacts/${encodeURIComponent(contactId)}/notes`, { method: "POST", body: JSON.stringify({ body }) }).then(
      (r) => r.note,
    );
  },
  updateNote(contactId: string, noteId: string, body: string): Promise<ContactNoteSummary> {
    return request<{ note: ContactNoteSummary }>(`/api/contacts/${encodeURIComponent(contactId)}/notes/${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }).then((r) => r.note);
  },
  deleteNote(contactId: string, noteId: string): Promise<void> {
    return request<{ ok: true }>(`/api/contacts/${encodeURIComponent(contactId)}/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }).then(() => undefined);
  },
  previewImport(csv: string): Promise<ImportPreview> {
    return request<ImportPreview>("/api/contacts/import/preview", { method: "POST", body: JSON.stringify({ csv }) });
  },
  /** Puts one contact at a stage, adding them to the pipeline if needed. Resolves to every pipeline they're in. */
  setStage(contactId: string, pipelineId: string, stageId: string): Promise<ContactPipelineRef[]> {
    return request<{ pipelines: ContactPipelineRef[] }>(`/api/contacts/${encodeURIComponent(contactId)}/pipelines`, {
      method: "PUT",
      body: JSON.stringify({ pipelineId, stageId }),
    }).then((r) => r.pipelines);
  },
  removeFromPipeline(contactId: string, pipelineId: string): Promise<ContactPipelineRef[]> {
    return request<{ pipelines: ContactPipelineRef[] }>(`/api/contacts/${encodeURIComponent(contactId)}/pipelines`, {
      method: "DELETE",
      body: JSON.stringify({ pipelineId }),
    }).then((r) => r.pipelines);
  },
  runImport(input: { csv: string; channelId: string; mapping: ImportMapping; pipelineId?: string; defaultStageId?: string; addTags?: string[] }): Promise<ImportResult> {
    return request<ImportResult>("/api/contacts/import", { method: "POST", body: JSON.stringify(input) });
  },
  remove(id: string): Promise<void> {
    return request<{ ok: true }>(`/api/contacts/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined);
  },
  removeMany(ids: string[]): Promise<{ deleted: number }> {
    return request<{ deleted: number }>("/api/contacts", { method: "DELETE", body: JSON.stringify({ ids }) });
  },
  bulkTags(ids: string[], add: string[], remove: string[]): Promise<{ added: number; removed: number }> {
    return request<{ added: number; removed: number }>("/api/contacts/bulk-tags", { method: "POST", body: JSON.stringify({ ids, add, remove }) });
  },
  renameTag(from: string, to: string): Promise<{ updated: number }> {
    return request<{ updated: number }>("/api/contacts/tags", { method: "PATCH", body: JSON.stringify({ from, to }) });
  },
  deleteTag(tag: string): Promise<{ updated: number }> {
    return request<{ updated: number }>("/api/contacts/tags", { method: "DELETE", body: JSON.stringify({ tag }) });
  },
  exportUrl(filters: ContactFilterState): string {
    const qs = filtersToSearchParams(filters).toString();
    return `/api/contacts/export${qs ? `?${qs}` : ""}`;
  },
};

/** Thin client for app/api/pipelines/*. */
export const pipelinesApi = {
  list(): Promise<PipelineSummary[]> {
    return request<{ pipelines: PipelineSummary[] }>("/api/pipelines").then((r) => r.pipelines);
  },
  create(input: CreatePipelineInput): Promise<PipelineSummary> {
    return request<{ pipeline: PipelineSummary }>("/api/pipelines", { method: "POST", body: JSON.stringify(input) }).then((r) => r.pipeline);
  },
  update(id: string, input: UpdatePipelineInput): Promise<PipelineSummary> {
    return request<{ pipeline: PipelineSummary }>(`/api/pipelines/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }).then(
      (r) => r.pipeline,
    );
  },
  remove(id: string): Promise<void> {
    return request<{ ok: true }>(`/api/pipelines/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined);
  },
  /** Contacts per stage id among those matching `filters` (their pipeline and stage are ignored). */
  counts(id: string, filters: ContactFilterState, signal?: AbortSignal): Promise<Record<string, number>> {
    const params = filtersToSearchParams({ ...filters, pipelineId: "", stageId: "" });
    return request<{ counts: Record<string, number> }>(`/api/pipelines/${encodeURIComponent(id)}/counts?${params.toString()}`, { signal }).then((r) => r.counts);
  },
};

export type SegmentInput = { name: string; description?: string | null; filters: SegmentFilters };

/** Thin client for app/api/segments/*. */
export const segmentsApi = {
  list(): Promise<SegmentSummary[]> {
    return request<{ segments: SegmentSummary[] }>("/api/segments").then((r) => r.segments);
  },
  create(input: SegmentInput): Promise<SegmentSummary> {
    return request<{ segment: SegmentSummary }>("/api/segments", { method: "POST", body: JSON.stringify(input) }).then((r) => r.segment);
  },
  update(id: string, input: Partial<SegmentInput>): Promise<SegmentSummary> {
    return request<{ segment: SegmentSummary }>(`/api/segments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }).then(
      (r) => r.segment,
    );
  },
  remove(id: string): Promise<void> {
    return request<{ ok: true }>(`/api/segments/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined);
  },
  preview(filters: SegmentFilters, signal?: AbortSignal): Promise<number> {
    return request<{ count: number }>("/api/segments/preview", { method: "POST", body: JSON.stringify({ filters }), signal }).then((r) => r.count);
  },
};

/** API messages are already customer copy; transport failures and anything technical get translated. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return clientErrorMessage(err, fallback) || fallback;
}
