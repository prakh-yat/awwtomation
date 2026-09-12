import type { User, WorkspaceRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { categorise, GENERIC_SERVER_ERROR, META_PASSTHROUGH_CODES } from "@/lib/errors/customer-messages";
import { logger, newErrorReference } from "@/lib/logger";
import { verifyRequestOrigin } from "@/lib/security/csrf";
import { ForbiddenError, getWorkspaceContext, type WorkspaceContext } from "@/lib/workspace/context";
import { roleRank } from "@/lib/workspace/permissions";

/**
 * Error carrying an HTTP status. Services throw these for expected failures
 * (not found, conflict, plan limit…) and `handleApiError` turns them into the
 * `{ error, code }` JSON shape from ARCHITECTURE §3. `headers` lets a 429
 * carry `Retry-After` without the thrower building a response itself.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Zod's own wording is field-level ("Required", "Invalid email") and safe to
 * show, but a `custom`/`invalid_type` issue can echo the received value or a
 * union's internals. Keep only the first sentence of each message, cap its
 * length, and drop anything that looks like it quotes a value or a type name.
 */
const ZOD_INTERNALS = /received|expected|\bunion\b|\bliteral\b|\bdiscriminator\b|\bZod|\bnull\b|\bundefined\b|\{|\}/i;
const MAX_FIELD_MESSAGE = 160;

function safeFieldMessage(message: string): string {
  const first = message.split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
  if (!first || ZOD_INTERNALS.test(first)) return "Invalid value";
  return first.length > MAX_FIELD_MESSAGE ? `${first.slice(0, MAX_FIELD_MESSAGE - 1)}…` : first;
}

function safeFieldErrors(fieldErrors: Record<string, string[] | undefined>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (!messages?.length) continue;
    // Field keys are our own schema keys (safe); dedupe the messages per field.
    out[field] = Array.from(new Set(messages.map(safeFieldMessage)));
  }
  return out;
}

/**
 * Normalises anything thrown inside a route handler into the `{ error, code }`
 * JSON contract. Two invariants matter for customers:
 * - `error` is always a sentence a customer may read. Raw Meta text (codes
 *   `META_ERROR` / `SEND_FAILED`) is translated through `categorise()`; the
 *   original is logged, never returned.
 * - Unexpected failures never leak `message`/`stack`. They get a fixed
 *   sentence plus an 8-char `reference` that the log line also carries, so
 *   support can find the real error from a screenshot.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    if (err.code && META_PASSTHROUGH_CODES.has(err.code)) {
      const friendly = categorise(err);
      logger.warn("api.meta_error", { code: err.code, category: friendly.category, status: err.status, detail: friendly.adminHint });
      return NextResponse.json(
        { error: friendly.description, code: err.code, category: friendly.category },
        { status: err.status, headers: err.headers },
      );
    }
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status, headers: err.headers });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
  }
  if (err instanceof ZodError) {
    const flat = err.flatten();
    const fieldErrors = safeFieldErrors(flat.fieldErrors);
    const formErrors = Array.from(new Set(flat.formErrors.map(safeFieldMessage)));
    // `error` stays a fixed sentence: the feature clients compose their own toast from `fieldErrors`.
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION", fieldErrors, formErrors }, { status: 422 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // The two Prisma failures that are almost always caller mistakes get a real status; everything else is ours.
    if (err.code === "P2025") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (err.code === "P2002") return NextResponse.json({ error: "That already exists", code: "CONFLICT" }, { status: 409 });
  }

  const reference = newErrorReference();
  logger.error("api.unhandled_error", { reference, error: err });
  return NextResponse.json({ error: GENERIC_SERVER_ERROR, code: "INTERNAL", reference }, { status: 500 });
}

/**
 * Next 15 route handlers receive `params` as a promise in the second argument.
 * Next always passes it (an empty promise for static routes), and the build-time
 * route validator rejects handlers that type it as optional, so it is required here.
 */
export type RouteParams<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };

export type WorkspaceHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  ctx: WorkspaceContext,
  route: RouteParams<P>,
) => Promise<Response>;

export type UserHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  user: User,
  route: RouteParams<P>,
) => Promise<Response>;

/**
 * Cookie auth makes every mutating route a CSRF target, so non-GET requests
 * must prove they were issued by our own origin (see lib/security/csrf.ts).
 * Returns the 403 to send, or null when the request may proceed.
 */
function rejectCrossSite(req: NextRequest): NextResponse | null {
  const verdict = verifyRequestOrigin(req);
  if (verdict.ok) return null;
  logger.warn("api.csrf_rejected", { method: req.method, path: req.nextUrl.pathname, reason: verdict.reason });
  return NextResponse.json({ error: "Cross-site request refused", code: "CSRF" }, { status: 403 });
}

/**
 * Wraps a route handler with auth + active-workspace resolution.
 * 401 when signed out, 403 when the user has no workspace or ranks below
 * `minRole`. Every thrown error is normalised by `handleApiError`, so handlers
 * can simply `throw new ApiError(404, "…")` or let zod throw.
 */
export function withWorkspace<P extends Record<string, string> = Record<string, string>>(
  handler: WorkspaceHandler<P>,
  opts?: { minRole?: WorkspaceRole },
) {
  return async (req: NextRequest, route: RouteParams<P>): Promise<Response> => {
    try {
      const csrf = rejectCrossSite(req);
      if (csrf) return csrf;

      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

      const ctx = await getWorkspaceContext();
      if (!ctx) return NextResponse.json({ error: "No workspace selected", code: "NO_WORKSPACE" }, { status: 403 });

      if (opts?.minRole && roleRank(ctx.role) < roleRank(opts.minRole)) {
        return NextResponse.json(
          { error: `This action requires the ${opts.minRole.toLowerCase()} role`, code: "FORBIDDEN" },
          { status: 403 },
        );
      }
      return await handler(req, ctx, route);
    } catch (err) {
      return handleApiError(err);
    }
  };
}

/**
 * Like `withWorkspace` but only requires a signed-in user. For endpoints that
 * must work before the user has any workspace (listing/creating workspaces,
 * accepting invitations) or that scope by an explicit workspace id in the URL.
 */
export function withUser<P extends Record<string, string> = Record<string, string>>(handler: UserHandler<P>) {
  return async (req: NextRequest, route: RouteParams<P>): Promise<Response> => {
    try {
      const csrf = rejectCrossSite(req);
      if (csrf) return csrf;

      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
      return await handler(req, user, route);
    } catch (err) {
      return handleApiError(err);
    }
  };
}

/**
 * Reads and validates a JSON body. Malformed JSON → 400; schema failures throw
 * `ZodError`, which `handleApiError` renders as 422 with field errors.
 */
export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON", "BAD_JSON");
  }
  return schema.parse(raw);
}

/** Parse `?page=&limit=`-style query strings with the same 422 semantics as bodies. */
export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const entries = Object.fromEntries(req.nextUrl.searchParams.entries());
  return schema.parse(entries);
}
