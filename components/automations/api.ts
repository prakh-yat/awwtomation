/**
 * Tiny fetch wrapper for the automations client components. Normalises the
 * `{ error, code, errors?, fieldErrors? }` JSON shape from ARCHITECTURE §3
 * into a thrown `ApiClientError` so callers can `toast.error(err.message)`.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    /** Per-item blockers (activation) or zod form errors, when the server sent them. */
    public errors: string[] = [],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ErrorBody = {
  error?: string;
  code?: string;
  errors?: string[];
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

function collectErrors(body: ErrorBody): string[] {
  const out: string[] = [];
  if (Array.isArray(body.errors)) out.push(...body.errors);
  if (Array.isArray(body.formErrors)) out.push(...body.formErrors);
  if (body.fieldErrors) {
    for (const [field, messages] of Object.entries(body.fieldErrors)) {
      for (const message of messages ?? []) out.push(`${field}: ${message}`);
    }
  }
  return out;
}

export async function apiFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body ?? {}) as ErrorBody;
    const errors = collectErrors(err);
    const message = err.error ?? (res.status === 404 ? "Not found" : "Something went wrong");
    throw new ApiClientError(errors.length > 0 && err.code === "VALIDATION" ? `${message}: ${errors[0]}` : message, res.status, err.code, errors);
  }
  return body as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
