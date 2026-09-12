/** Thin fetch wrapper for the inbox client: JSON in/out, errors surfaced as `InboxApiError`. */

export class InboxApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "InboxApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type ApiInit = { method?: "GET" | "POST" | "PATCH" | "DELETE"; json?: unknown; signal?: AbortSignal };

export async function apiFetch<T>(url: string, init: ApiInit = {}): Promise<T> {
  const hasBody = init.json !== undefined;
  const res = await fetch(url, {
    method: init.method ?? (hasBody ? "POST" : "GET"),
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.json) : undefined,
    signal: init.signal,
    cache: "no-store",
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = isRecord(data) ? data : {};
    const message = typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new InboxApiError(res.status, message, typeof body.code === "string" ? body.code : undefined);
  }
  return data as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof DOMException && err.name === "AbortError") return "";
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
