/**
 * Tiny fetch wrapper for the settings lane's client components. The
 * workspace/invitation routes all answer with `{ error, code }` on failure
 * (ARCHITECTURE §3), so one helper can turn any non-2xx into a typed error
 * that the UI can toast — and branch on `code` for plan-limit upsells.
 */
export class ClientApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

type ErrorBody = { error?: string; code?: string };

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Serialised as the JSON body with the matching content-type header. */
  json?: unknown;
};

export async function apiFetch<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    });
  } catch {
    throw new ClientApiError(0, "Network error — check your connection and try again");
  }

  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // Non-JSON error page (e.g. a proxy 502); fall through to the generic message.
    }
    throw new ClientApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function isPlanLimitError(err: unknown): boolean {
  return err instanceof ClientApiError && err.code === "PLAN_LIMIT";
}
