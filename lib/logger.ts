/**
 * Structured JSON-lines logger.
 *
 * One line per event so log drains (Vercel, Railway, Datadog…) can index on
 * `event` and `level` without parsing free text. Uses `console.*` under the
 * hood because that is the only sink shared by the Node runtime, the Edge
 * runtime (middleware) and the worker process. This module is the single
 * sanctioned place where `console` is called from production code.
 */

export type LogLevel = "info" | "warn" | "error";

type Serializable = Record<string, unknown>;

/** Errors don't survive JSON.stringify — flatten the useful bits explicitly. */
function serializeError(err: Error): Serializable {
  const out: Serializable = { name: err.name, message: err.message };
  if (err.stack) out.stack = err.stack;
  if (err.cause !== undefined) out.cause = err.cause instanceof Error ? serializeError(err.cause) : err.cause;
  // Custom error classes commonly carry a status/code we want to see.
  const extra = err as unknown as Record<string, unknown>;
  for (const key of ["status", "code", "subcode"]) {
    if (extra[key] !== undefined) out[key] = extra[key];
  }
  return out;
}

/**
 * Keys whose values must never reach a log drain. Matched case-insensitively
 * against every key while walking the meta object, so `accessTokenEnc`,
 * `Authorization`, `refresh_token`, `cookie` and friends are all caught.
 */
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|access_token/i;
const REDACTED = "[REDACTED]";
const REDACT_DEPTH = 4;

/**
 * Recursively replaces sensitive values before serialization. Keys are
 * scrubbed on the top level and four nested levels below it; deeper
 * structures pass through untouched (and `formatLine` still guards against
 * cycles), so a huge or self-referencing meta can't hang the logger.
 */
function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > REDACT_DEPTH) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Serializable = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = inner instanceof Error ? redact(serializeError(inner), depth + 1) : redact(inner, depth + 1);
  }
  return out;
}

function normalizeMeta(meta?: object): Serializable {
  if (!meta) return {};
  if (meta instanceof Error) return { error: redact(serializeError(meta)) };
  return redact(meta) as Serializable;
}

/** BigInt is not JSON-serializable; Prisma aggregates occasionally return it. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function formatLine(level: LogLevel, event: string, meta?: object): string {
  const base = { level, event, time: new Date().toISOString() };
  try {
    return JSON.stringify({ ...base, ...normalizeMeta(meta) }, replacer);
  } catch {
    // Circular structures etc. — never let logging itself throw.
    return JSON.stringify({ ...base, metaError: "unserializable meta" });
  }
}

/**
 * Short opaque id that ties a customer-visible "Reference: …" to the log line
 * carrying the real error. 8 hex chars is enough to grep a log drain and
 * gives away nothing about the failure. Runs on Node, Edge and the worker
 * (`globalThis.crypto` is present in all three).
 */
export function newErrorReference(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}

export const logger = {
  info(event: string, meta?: object): void {
    console.log(formatLine("info", event, meta));
  },
  warn(event: string, meta?: object): void {
    console.warn(formatLine("warn", event, meta));
  },
  error(event: string, meta?: object): void {
    console.error(formatLine("error", event, meta));
  },
};

export type Logger = typeof logger;
