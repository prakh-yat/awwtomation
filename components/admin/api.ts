/**
 * Minimal fetch wrapper for the admin client components. Surfaces the
 * `{ error }` message from `handleApiError` so toasts say something useful.
 */
type AdminFetchInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

export async function adminFetch<T>(input: string, init?: AdminFetchInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}
