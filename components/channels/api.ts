"use client";

import { clientErrorMessage } from "@/lib/errors/customer-messages";

/**
 * Minimal fetch wrapper for the channels client components. Turns the
 * `{ error, code }` JSON contract from ARCHITECTURE §3 into a thrown Error
 * whose message is safe to show in a toast.
 */
export class ChannelApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ChannelApiError";
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    credentials: "same-origin",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON bodies (proxies, HTML error pages) fall through to the status-based message.
  }
  if (!res.ok) {
    const parsed = typeof body === "object" && body !== null ? (body as { error?: unknown; code?: unknown }) : {};
    const message = typeof parsed.error === "string" ? parsed.error : `Request failed (${res.status})`;
    throw new ChannelApiError(message, res.status, typeof parsed.code === "string" ? parsed.code : undefined);
  }
  return body as T;
}

/** API messages are already customer copy; status codes, transport failures and anything technical get translated. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return clientErrorMessage(err, fallback) || fallback;
}
