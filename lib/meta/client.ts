import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MetaApiError, MetaNetworkError, MetaRateLimitError, MetaTokenError } from "./types";

export const GRAPH_FACEBOOK_HOST = "https://graph.facebook.com";
export const GRAPH_INSTAGRAM_HOST = "https://graph.instagram.com";
export const INSTAGRAM_OAUTH_HOST = "https://api.instagram.com";

export const DEFAULT_GRAPH_VERSION = "v25.0";

export function graphVersion(): string {
  return optionalEnv("META_GRAPH_API_VERSION") ?? DEFAULT_GRAPH_VERSION;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** `graphUrl(host, "/me", { fields: "id" })` → `https://host/v25.0/me?fields=id`. */
export function graphUrl(host: string, path: string, params?: QueryParams, opts: { versioned?: boolean } = {}): string {
  const versioned = opts.versioned ?? true;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${host}${versioned ? `/${graphVersion()}` : ""}${cleanPath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export type MetaFetchInit = RequestInit & {
  /** Access token: appended as `access_token` unless the URL already carries one (paging.next does). */
  token?: string;
  /** Extra query params merged into the URL. */
  query?: QueryParams;
  /** JSON body (sets method POST and content-type). */
  json?: unknown;
  /** application/x-www-form-urlencoded body (sets method POST). */
  form?: Record<string, string>;
  timeoutMs?: number;
};

// Rate limiting: app (4), user (17), page (32), custom (613), business-use-case (80001..80008)
// and the Instagram messaging "too many messages" subcode 2534022.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80007, 80008]);
const RATE_LIMIT_SUBCODES = new Set([2534022]);
// 190 = invalid/expired OAuth token, 102 = session key invalid.
const TOKEN_CODES = new Set([190, 102]);

export function isRateLimitCode(code?: number, subcode?: number): boolean {
  return (code !== undefined && RATE_LIMIT_CODES.has(code)) || (subcode !== undefined && RATE_LIMIT_SUBCODES.has(subcode));
}

export function isTokenCode(code?: number): boolean {
  return code !== undefined && TOKEN_CODES.has(code);
}

type GraphErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  is_transient?: boolean;
  error_user_msg?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractGraphError(data: unknown): GraphErrorBody | null {
  if (!isRecord(data) || !isRecord(data.error)) return null;
  const e = data.error;
  return {
    message: typeof e.message === "string" ? e.message : undefined,
    type: typeof e.type === "string" ? e.type : undefined,
    code: typeof e.code === "number" ? e.code : typeof e.code === "string" ? Number(e.code) : undefined,
    error_subcode: typeof e.error_subcode === "number" ? e.error_subcode : undefined,
    fbtrace_id: typeof e.fbtrace_id === "string" ? e.fbtrace_id : undefined,
    is_transient: e.is_transient === true,
    error_user_msg: typeof e.error_user_msg === "string" ? e.error_user_msg : undefined,
  };
}

/** Map a Graph error body + HTTP status onto our error hierarchy. Exported for tests and callers that parse manually. */
export function toMetaError(err: GraphErrorBody | null, status: number): MetaApiError {
  const code = err?.code;
  const subcode = err?.error_subcode;
  const message = err?.message ?? err?.error_user_msg ?? `Meta API responded with HTTP ${status}`;
  const trace = err?.fbtrace_id;
  if (status === 429 || isRateLimitCode(code, subcode)) return new MetaRateLimitError(message, code, subcode, status, trace);
  if (isTokenCode(code)) return new MetaTokenError(message, code, subcode, status, trace);
  const generic = new MetaApiError(message, code, subcode, status, trace);
  // Code 1 = "unknown error", 2 = "service temporarily unavailable": both are Meta's own "try again".
  generic.isTransient = Boolean(err?.is_transient) || status >= 500 || code === 1 || code === 2;
  return generic;
}

/**
 * Meta returns throttling telemetry in headers; warn once we cross 80% so an
 * operator sees it before calls start failing with code 4/17/32.
 */
function logUsageHeaders(headers: Headers, path: string): void {
  for (const name of ["x-app-usage", "x-business-use-case-usage", "x-ad-account-usage"]) {
    const raw = headers.get(name);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const max = maxNumeric(parsed);
      if (max >= 80) logger.warn("meta.usage_high", { header: name, usage: parsed, path });
    } catch {
      // Not JSON: ignore; this is telemetry only.
    }
  }
}

function maxNumeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return Math.max(0, ...value.map(maxNumeric));
  if (isRecord(value)) {
    // `estimated_time_to_regain_access` is minutes, not a percentage: skip it.
    return Math.max(0, ...Object.entries(value).filter(([k]) => k !== "estimated_time_to_regain_access").map(([, v]) => maxNumeric(v)));
  }
  return 0;
}

function safePath(url: URL): string {
  return url.pathname;
}

/**
 * Thin fetch wrapper for graph.facebook.com / graph.instagram.com / api.instagram.com.
 * - adds `access_token`
 * - throws `MetaRateLimitError` / `MetaTokenError` / `MetaApiError` from Graph error bodies
 * - throws `MetaNetworkError` for transport failures so the queue retries
 * Never logs the token.
 */
export async function metaFetch<T>(url: string, init: MetaFetchInit = {}): Promise<T> {
  const { token, query, json, form, timeoutMs = 20_000, headers, body: rawBody, signal, ...rest } = init;

  const target = new URL(url);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    }
  }
  if (token && !target.searchParams.has("access_token")) target.searchParams.set("access_token", token);

  const requestHeaders = new Headers(headers);
  let body: BodyInit | null | undefined = rawBody;
  if (json !== undefined) {
    body = JSON.stringify(json);
    requestHeaders.set("content-type", "application/json");
  } else if (form) {
    body = new URLSearchParams(form);
  }
  const method = rest.method ?? (body ? "POST" : "GET");

  let res: Response;
  try {
    res = await fetch(target, { ...rest, method, headers: requestHeaders, body, signal: signal ?? AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("meta.network_error", { path: safePath(target), method, error: message });
    throw new MetaNetworkError(`Network error calling Meta (${method} ${safePath(target)}): ${message}`);
  }

  logUsageHeaders(res.headers, safePath(target));

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // HTML error pages from the edge, empty bodies on 5xx, etc.
      if (!res.ok) throw new MetaNetworkError(`Meta returned non-JSON HTTP ${res.status} for ${safePath(target)}`, res.status);
      throw new MetaApiError(`Meta returned non-JSON body for ${safePath(target)}`, undefined, undefined, res.status);
    }
  }

  const graphError = extractGraphError(data);
  if (graphError || !res.ok) {
    const error = toMetaError(graphError, res.status);
    logger.warn("meta.api_error", {
      path: safePath(target),
      method,
      status: res.status,
      code: error.code,
      subcode: error.subcode,
      traceId: error.traceId,
      kind: error.name,
      message: error.message,
    });
    throw error;
  }

  return data as T;
}

/** Parse Graph timestamps like `2024-01-01T00:00:00+0000` (no colon in the offset). */
export function parseGraphDate(value: unknown): Date | undefined {
  if (typeof value === "number") return new Date(value > 1e11 ? value : value * 1000);
  if (typeof value !== "string" || !value) return undefined;
  const fixed = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(fixed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Follow `paging.next` links, collecting up to `maxItems` items. `paging.next` already carries the token. */
export async function metaFetchAll<T>(firstUrl: string, token: string, opts: { maxItems?: number; maxPages?: number } = {}): Promise<T[]> {
  const maxItems = opts.maxItems ?? 500;
  const maxPages = opts.maxPages ?? 20;
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  for (let page = 0; url && page < maxPages && out.length < maxItems; page++) {
    const res: { data?: T[]; paging?: { next?: string } } = await metaFetch(url, { token });
    out.push(...(res.data ?? []));
    url = res.paging?.next;
  }
  return out.slice(0, maxItems);
}
