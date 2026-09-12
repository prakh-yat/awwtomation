/** Tiny fetch helpers shared by the broadcast client components. */

type ErrorBody = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody;
    const firstField = body.fieldErrors ? Object.values(body.fieldErrors).flat().find(Boolean) : undefined;
    return firstField ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** JSON request that throws an Error carrying the API's message on non-2xx. */
export async function apiFetch<T>(input: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(input, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) throw new Error(await readError(res, `Request failed (${res.status})`));
  return (await res.json()) as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
