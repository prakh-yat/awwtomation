import { NextRequest } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ONE_MEGABYTE, PayloadTooLargeError, readBodyWithLimit } from "@/lib/security/body-limit";
import { clientIp, enforceIpRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { processWebhookBody } from "@/lib/webhooks/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta batches events, so a single legitimate sender never approaches this;
 * it exists to keep a flood from a spoofed source off the signature check
 * and the database.
 */
const WEBHOOK_LIMIT_PER_MINUTE = 600;
const WEBHOOK_MAX_BODY_BYTES = ONE_MEGABYTE;

/** Meta's one-time subscription handshake: echo `hub.challenge` when the verify token matches. */
export async function GET(req: NextRequest): Promise<Response> {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = optionalEnv("META_WEBHOOK_VERIFY_TOKEN");

  if (mode === "subscribe" && expected && token && challenge && constantTimeEqual(token, expected)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  logger.warn("webhook.verify_rejected", { mode, hasToken: Boolean(token), configured: Boolean(expected) });
  return new Response("Forbidden", { status: 403 });
}

/**
 * Always 200 once a body is accepted — Meta disables webhooks that keep
 * failing, and every event is persisted before processing so nothing is lost
 * when we log an error instead. The two non-200s (429, 413) fire only for
 * traffic Meta itself would never send.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const limited = enforceIpRateLimit(req, "webhook_meta", WEBHOOK_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (limited) {
    logger.warn("webhook.rate_limited", { ip: clientIp(req) });
    return limited;
  }

  let rawBody = "";
  try {
    rawBody = await readBodyWithLimit(req, WEBHOOK_MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      logger.warn("webhook.body_too_large", { ip: clientIp(req), declared: req.headers.get("content-length") });
      return new Response("Payload Too Large", { status: 413, headers: { "content-type": "text/plain" } });
    }
    logger.error("webhook.body_read_error", { error: err instanceof Error ? err.message : String(err) });
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  const result = await processWebhookBody(rawBody, signature);
  if (result.reason) logger.warn("webhook.rejected", { reason: result.reason });

  return new Response("EVENT_RECEIVED", { status: 200, headers: { "content-type": "text/plain" } });
}
