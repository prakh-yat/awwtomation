"use client";

import { clientErrorMessage } from "@/lib/errors/customer-messages";
import type { CreateLinkInput, TrackedLinkListItem, TrackedLinkStats, UpdateLinkInput } from "@/lib/services/links";

/** Thrown for non-2xx responses; `message` is the server's `error` field so it can go straight into a toast. */
export class LinksApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "LinksApiError";
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
    const err = (body ?? {}) as { error?: string; code?: string; fieldErrors?: Record<string, string[]> };
    // Surface the first field error verbatim: "Enter a full URL…" beats "Validation failed".
    const firstField = err.fieldErrors ? Object.values(err.fieldErrors).flat()[0] : undefined;
    throw new LinksApiError(res.status, firstField ?? err.error ?? `Request failed (${res.status})`, err.code);
  }
  return body as T;
}

export const linksApi = {
  list(q?: string): Promise<TrackedLinkListItem[]> {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return request<{ items: TrackedLinkListItem[] }>(`/api/links${qs ? `?${qs}` : ""}`).then((r) => r.items);
  },
  create(input: CreateLinkInput): Promise<TrackedLinkListItem> {
    return request<{ link: TrackedLinkListItem }>("/api/links", { method: "POST", body: JSON.stringify(input) }).then((r) => r.link);
  },
  update(id: string, input: UpdateLinkInput): Promise<TrackedLinkListItem> {
    return request<{ link: TrackedLinkListItem }>(`/api/links/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }).then(
      (r) => r.link,
    );
  },
  remove(id: string): Promise<void> {
    return request<{ ok: true }>(`/api/links/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined);
  },
  stats(id: string, days: number, signal?: AbortSignal): Promise<TrackedLinkStats> {
    return request<TrackedLinkStats>(`/api/links/${encodeURIComponent(id)}?days=${days}`, { signal });
  },
};

/** API messages are already customer copy; transport failures and anything technical get translated. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return clientErrorMessage(err, fallback) || fallback;
}
