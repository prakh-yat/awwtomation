import type { Contact } from "@prisma/client";

import type { ContactListResult, ContactTagCount, UpdateContactInput } from "@/lib/services/contacts";
import type { SegmentFilters, SegmentSummary } from "@/lib/services/segments";

import { type ContactFilterState, filtersToSearchParams } from "./filters";

export type { ContactFilterState } from "./filters";
export { EMPTY_FILTERS, filtersToSearchParams, hasActiveFilters } from "./filters";

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
  list(filters: ContactFilterState, opts: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}): Promise<ContactListResult> {
    const params = filtersToSearchParams(filters);
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    return request<ContactListResult>(`/api/contacts?${params.toString()}`, { signal: opts.signal });
  },
  tags(): Promise<ContactTagCount[]> {
    return request<{ tags: ContactTagCount[] }>("/api/contacts/tags").then((r) => r.tags);
  },
  update(id: string, data: UpdateContactInput): Promise<Contact> {
    return request<{ contact: Contact }>(`/api/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }).then(
      (r) => r.contact,
    );
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

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
