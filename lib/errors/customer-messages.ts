/**
 * Customer-facing error copy.
 *
 * Everything the platform stores or throws about a failed send is technical:
 * Graph error codes, `MetaTokenError` messages, Prisma codes, our own
 * `sendToContact` strings. None of it should reach a customer verbatim. This
 * module is the single translation layer: `categorise()` turns any error (or
 * raw stored message) into a fixed category with plain-English copy, and
 * `deliveryReason()` does the same per `DeliveryStatus`.
 *
 * Pure and dependency-free on purpose: it is imported by client components,
 * route handlers and server components alike, so it must never pull in
 * `lib/db`, `lib/meta/*` or anything else server-only. Meta error classes are
 * recognised by `name` / `code` rather than `instanceof` for the same reason.
 */
import type { DeliveryStatus } from "@prisma/client";

export type ErrorCategory =
  | "meta_permission"
  | "meta_rate_limit"
  | "meta_token"
  | "meta_window"
  | "meta_recipient"
  | "network"
  | "plan_limit"
  | "validation"
  | "unknown";

export type CustomerMessage = {
  category: ErrorCategory;
  /** Short noun phrase for badges and toast titles ("Reconnect needed"). */
  title: string;
  /** Plain English, actionable. Never contains Graph codes, URLs, ids or stack text. */
  description: string;
  /**
   * The technical detail (raw message, Graph code/subcode, HTTP status) for
   * ADMIN+ users behind a "Technical details" disclosure. Null when the
   * input carried nothing beyond what `description` already says.
   */
  adminHint: string | null;
};

export type DeliveryReason = CustomerMessage & {
  /** Badge / table label ("Over 24 hours"). */
  label: string;
};

/** The only sentence a customer sees for an unexpected server failure. */
export const GENERIC_SERVER_ERROR = "Something went wrong on our side. Please try again.";

/** `ApiError.code`s whose message may carry raw Graph text and must be translated before leaving the server. */
export const META_PASSTHROUGH_CODES: ReadonlySet<string> = new Set(["META_ERROR", "SEND_FAILED"]);

const COPY: Record<ErrorCategory, { title: string; description: string }> = {
  meta_permission: {
    title: "Permission missing",
    description: "Reconnect the account from the dashboard and allow every permission it asks for.",
  },
  meta_rate_limit: {
    title: "Sending paused",
    description: "Too many messages went out at once. Sending picks up again on its own.",
  },
  meta_token: {
    title: "Reconnect needed",
    description: "Reconnect the account from the dashboard to keep sending.",
  },
  meta_window: {
    title: "Over 24 hours",
    description: "They haven't messaged you in the last 24 hours, so they need to message you first.",
  },
  meta_recipient: {
    title: "Can't reach this person",
    description: "They may have blocked the account or turned off messages.",
  },
  network: {
    title: "Connection problem",
    description: "Couldn't reach Instagram or Facebook. Try again in a moment.",
  },
  plan_limit: {
    title: "Monthly limit reached",
    description: "This month's DMs are used up. Upgrade your plan to keep sending.",
  },
  validation: {
    title: "Message not accepted",
    description: "Part of the message wasn't accepted, often a link or a button. Check it and try again.",
  },
  unknown: {
    title: "Something went wrong",
    description: "Try again. If it keeps happening, reconnect the account from the dashboard.",
  },
};

// ───────────────────────── Graph code tables ─────────────────────────
// Sources: Graph API error reference + Messenger/Instagram Messaging send errors.

const TOKEN_CODES = new Set([102, 190, 463, 467]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80007, 80008]);
const PERMISSION_CODES = new Set([10, 200, 210, 230, 294, 299]);
const RECIPIENT_CODES = new Set([551, 2018001, 2018108, 2018278, 2022, 1545041]);
const WINDOW_SUBCODES = new Set([2534022, 2018278]);
const RECIPIENT_SUBCODES = new Set([2534014, 2534015, 2018108, 1545041]);
const TRANSIENT_CODES = new Set([1, 2]);

// ───────────────────────── Message patterns ─────────────────────────
// Order matters: the first family that matches wins. Patterns cover Graph's
// own wording, our `sendToContact` / channel service strings and the
// `ApiError.code`s that the API attaches.

const TOKEN_RE =
  /access token|session has expired|token (?:is )?(?:invalid|expired)|token expired|invalid oauth|error validating access token|channel token invalid|channel is (?:token expired|disconnected|error)|stored token can't be read|TOKEN_EXPIRED|TOKEN_UNREADABLE|CHANNEL_INACTIVE|CHANNEL_DISCONNECTED/i;
const WINDOW_RE =
  /24[ -]?h(?:ours?)?\b|messaging window|allowed window|outside of (?:the )?window|has never messaged|last replied|WINDOW_CLOSED/i;
const RATE_LIMIT_RE = /rate limit|request limit|too many (?:requests|messages|calls)|throttl|exceeded the (?:rate|limit)|RATE_LIMITED/i;
const PLAN_LIMIT_RE = /monthly dm limit|plan limit|dm quota|PLAN_LIMIT/i;
const RECIPIENT_RE =
  /user has blocked|blocked this account|isn't available|is not available|no matching user|cannot be messaged|not a valid user|user cannot be found|person isn't available|unavailable right now|deactivated|restricted|opted out|declined to receive|OPTED_OUT/i;
const PERMISSION_RE =
  /permission|not authori[sz]ed|unauthori[sz]ed|forbidden|does not have (?:the )?capabilit|missing scope|insufficient scope/i;
const NETWORK_RE =
  /network error|fetch failed|failed to fetch|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timed? ?out|non-json|service temporarily unavailable|unknown error has occurred|socket hang up|abort|HTTP 5\d\d/i;
const VALIDATION_RE =
  /invalid parameter|invalid param|unsupported|exceeds|too long|too many buttons|malformed|invalid url|must be|is required|VALIDATION|BAD_JSON/i;

type ErrorShape = {
  name?: string;
  message: string;
  code?: number;
  subcode?: number;
  status?: number;
  /** `ApiError.code` / client error code: a string, unlike Graph's numeric `code`. */
  apiCode?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

/** Graph codes are often only present inline: "(#10) Application does not have permission…". */
function codeFromText(message: string): number | undefined {
  const inline = /\(#(\d+)\)/.exec(message);
  if (inline) return Number(inline[1]);
  const labelled = /\bcode[ :=]+(\d+)\b/i.exec(message);
  return labelled ? Number(labelled[1]) : undefined;
}

function shapeOf(input: unknown): ErrorShape | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    const message = input.trim();
    if (!message) return null;
    return { message, code: codeFromText(message) };
  }
  if (isRecord(input)) {
    const message = typeof input.message === "string" ? input.message : "";
    const code = asNumber(input.code);
    const apiCode = typeof input.code === "string" && !/^\d+$/.test(input.code) ? input.code : undefined;
    return {
      name: typeof input.name === "string" ? input.name : undefined,
      message,
      code: code ?? codeFromText(message),
      subcode: asNumber(input.subcode) ?? asNumber(input.error_subcode),
      status: asNumber(input.status),
      apiCode,
    };
  }
  return { message: String(input) };
}

function classify(shape: ErrorShape): ErrorCategory {
  const { name, message, code, subcode, status, apiCode } = shape;
  // A haystack that lets the regexes see the ApiError code too (e.g. "WINDOW_CLOSED").
  const text = apiCode ? `${message} ${apiCode}` : message;

  if (name === "MetaTokenError" || (code !== undefined && TOKEN_CODES.has(code)) || TOKEN_RE.test(text)) return "meta_token";
  if ((subcode !== undefined && WINDOW_SUBCODES.has(subcode)) || WINDOW_RE.test(text)) return "meta_window";
  if (
    name === "MetaRateLimitError" ||
    (code !== undefined && RATE_LIMIT_CODES.has(code)) ||
    status === 429 ||
    RATE_LIMIT_RE.test(text)
  ) {
    return "meta_rate_limit";
  }
  if (PLAN_LIMIT_RE.test(text) || status === 402) return "plan_limit";
  if (
    (subcode !== undefined && RECIPIENT_SUBCODES.has(subcode)) ||
    (code !== undefined && RECIPIENT_CODES.has(code)) ||
    RECIPIENT_RE.test(text)
  ) {
    return "meta_recipient";
  }
  if ((code !== undefined && PERMISSION_CODES.has(code)) || PERMISSION_RE.test(text)) return "meta_permission";
  if (
    name === "MetaNetworkError" ||
    name === "TypeError" ||
    (code !== undefined && TRANSIENT_CODES.has(code)) ||
    (status !== undefined && status >= 500) ||
    NETWORK_RE.test(text)
  ) {
    return "network";
  }
  if (code === 100 || VALIDATION_RE.test(text) || status === 422) return "validation";
  return "unknown";
}

function buildAdminHint(shape: ErrorShape): string | null {
  const parts: string[] = [];
  if (shape.message) parts.push(shape.message);
  if (shape.name && shape.name !== "Error" && !shape.message.includes(shape.name)) parts.unshift(shape.name);
  const meta: string[] = [];
  if (shape.code !== undefined && !/\(#\d+\)/.test(shape.message)) meta.push(`code ${shape.code}`);
  if (shape.subcode !== undefined) meta.push(`subcode ${shape.subcode}`);
  if (shape.status !== undefined) meta.push(`HTTP ${shape.status}`);
  if (shape.apiCode) meta.push(shape.apiCode);
  if (meta.length) parts.push(meta.join(" · "));
  const hint = parts.join(" | ").trim();
  return hint ? hint : null;
}

/**
 * Turn any error: a `MetaApiError` subclass, an `ApiError`, a fetch failure,
 * or a raw string stored on `DeliveryLog.errorMessage` / `Channel.lastError`
 *: into customer-safe copy plus an ADMIN-only technical hint.
 */
export function categorise(input: unknown): CustomerMessage {
  const shape = shapeOf(input);
  if (!shape) return { category: "unknown", ...COPY.unknown, adminHint: null };
  const category = classify(shape);
  return { category, ...COPY[category], adminHint: buildAdminHint(shape) };
}

/** British and American spellings both exist in the codebase; keep one export per spelling. */
export const categorize = categorise;

// ───────────────────────── Delivery statuses ─────────────────────────

type StatusCopy = { label: string; title: string; description: string; category: ErrorCategory };

const STATUS_COPY: Record<Exclude<DeliveryStatus, "FAILED">, StatusCopy> = {
  SENT: {
    label: "Sent",
    title: "Sent",
    description: "It went out.",
    category: "unknown",
  },
  SKIPPED_DUPLICATE: {
    label: "Already sent",
    title: "Already sent",
    description: "This person already got it from this automation.",
    category: "unknown",
  },
  SKIPPED_RATE_LIMIT: {
    label: "Too many at once",
    title: "Sending limit reached",
    description: "Too many messages went out in the same hour, so this one was skipped.",
    category: "meta_rate_limit",
  },
  SKIPPED_SELF: {
    label: "Own account",
    title: "Own account",
    description: "The comment came from your own account.",
    category: "unknown",
  },
  SKIPPED_NOT_FOLLOWING: {
    label: "Not following",
    title: "Not following",
    description: "They don't follow the account yet, so they got the follow prompt instead.",
    category: "unknown",
  },
  SKIPPED_WINDOW: {
    label: "Over 24 hours",
    title: "Over 24 hours",
    description: COPY.meta_window.description,
    category: "meta_window",
  },
  SKIPPED_PLAN_LIMIT: {
    label: "Monthly limit",
    title: "Monthly limit reached",
    description: COPY.plan_limit.description,
    category: "plan_limit",
  },
  SKIPPED_CONTACT_LIMIT: {
    label: "Contact limit",
    title: "Contact limit reached",
    description: "This person arrived after your plan's contact limit. They're saved, but automations wait until you upgrade.",
    category: "plan_limit",
  },
  SKIPPED_OPTED_OUT: {
    label: "Opted out",
    title: "Opted out",
    description: "They asked not to get automated messages.",
    category: "meta_recipient",
  },
};

/**
 * Customer copy for a DeliveryLog row. Skips are explained by the status
 * alone (the stored message only repeats it); failures are categorised from
 * the stored Meta message, which is kept solely as the ADMIN hint.
 */
export function deliveryReason(status: DeliveryStatus, errorMessage?: string | null): DeliveryReason {
  if (status === "FAILED") {
    const message = categorise(errorMessage ?? null);
    const label = message.category === "unknown" ? "Failed" : message.title;
    return { ...message, label };
  }
  const copy = STATUS_COPY[status];
  return { category: copy.category, label: copy.label, title: copy.title, description: copy.description, adminHint: null };
}

/**
 * The only form a delivery outcome may take once it leaves the server: a short
 * plain-language reason, or null when it was sent. The raw text Meta returned
 * stays in the database and the server logs: never in a page or API response.
 */
export function customerReason(status: DeliveryStatus, errorMessage: string | null | undefined): string | null {
  if (status === "SENT") return null;
  return deliveryReason(status, errorMessage).label;
}

// ───────────────────────── Client helpers ─────────────────────────

/** Anything that would tell a customer more about our stack than about their problem. */
const TECHNICAL_RE =
  /\(#\d+\)|OAuthException|fbtrace|graph\.(?:facebook|instagram)\.com|https?:\/\/|\bat [\w.<>]+ \(|\bError: |ECONN|ETIMEDOUT|Prisma|\bP\d{4}\b|undefined|null|\{"|\bstack\b/i;

function isAbortError(err: unknown): boolean {
  return isRecord(err) && err.name === "AbortError";
}

/**
 * Message for a toast after a failed client `fetch`. API bodies are already
 * sanitised by `handleApiError`, so the `error` string is used as-is; only
 * transport failures and anything that still looks technical are translated.
 * Returns "" for aborted requests so callers can skip the toast.
 */
export function clientErrorMessage(err: unknown, fallback = GENERIC_SERVER_ERROR): string {
  if (isAbortError(err)) return "";
  if (err instanceof TypeError) return COPY.network.description;
  if (!(err instanceof Error) || !err.message) return fallback;

  const generic = /^Request failed \((\d{3})\)$/.exec(err.message);
  if (generic) return Number(generic[1]) >= 500 ? GENERIC_SERVER_ERROR : fallback;

  return TECHNICAL_RE.test(err.message) ? categorise(err).description : err.message;
}
