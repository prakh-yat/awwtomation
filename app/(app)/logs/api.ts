"use client";

import type { DeliveryLogListResult, LogStats } from "@/lib/services/logs";

import { type LogFilterState, logFiltersToSearchParams } from "./filters";

/** Thrown for non-2xx responses; `message` is the server's `error` field so it can go straight into a toast. */
export class LogsApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "LogsApiError";
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Empty or non-JSON body; handled below.
  }
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; code?: string };
    throw new LogsApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code);
  }
  return body as T;
}

export type LogPageResponse = DeliveryLogListResult & { stats: LogStats | null };

export const logsApi = {
  list(filters: LogFilterState, opts: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}): Promise<LogPageResponse> {
    const params = logFiltersToSearchParams(filters);
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    return request<LogPageResponse>(`/api/logs?${params.toString()}`, { signal: opts.signal });
  },
  exportUrl(filters: LogFilterState): string {
    const qs = logFiltersToSearchParams(filters).toString();
    return `/api/logs/export${qs ? `?${qs}` : ""}`;
  },
};

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
