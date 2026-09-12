import { NextRequest, NextResponse } from "next/server";

import { parseWebhook } from "@/lib/billing/dodo/events";
import { logger } from "@/lib/logger";
import { applyWebhookEvent } from "@/lib/services/billing";
import { ApiError } from "@/lib/workspace/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dodo retries on non-2xx; anything larger than this isn't a billing event. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * POST /api/billing/webhook — public, authenticated by the Standard Webhooks
 * signature over the raw body (no session, no workspace context).
 * 200 for handled or duplicate events, 401 for bad signatures, 5xx when
 * processing failed so Dodo redelivers.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    logger.error("billing.webhook_body_read_error", { error: err });
    return NextResponse.json({ error: "Could not read body" }, { status: 400 });
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let event;
  try {
    event = parseWebhook(rawBody, req.headers);
  } catch (err) {
    if (err instanceof ApiError) {
      logger.warn("billing.webhook_rejected", { status: err.status, code: err.code });
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    logger.error("billing.webhook_parse_error", { error: err });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const outcome = await applyWebhookEvent(event);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    // Already logged with context by applyWebhookEvent; a 500 makes Dodo retry with backoff.
    const status = err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.status : 500;
    return NextResponse.json({ error: "Processing failed", eventId: event.eventId }, { status });
  }
}
