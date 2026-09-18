/**
 * Webhook ingestion. Verifies the signature, normalizes the body, persists a
 * WebhookEvent per event (idempotency), resolves the Channel and hands the
 * event to the engine. Never throws: the route must answer 200 quickly and
 * Meta redelivers anything we fail on because `processed` stays false.
 */
import { ChannelStatus, Prisma, type ChannelPlatform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleIncomingEvent } from "@/lib/automation/engine";
import type { NormalizedEvent } from "@/lib/meta/types";
import { normalizeWebhookPayload, verifyMetaSignature, webhookDedupeKey } from "@/lib/meta/webhook";

export type ProcessWebhookResult = { accepted: number; skipped: number; reason?: "invalid_signature" | "invalid_json" | "error" };

/** Facebook-app webhooks sign with META_APP_SECRET; Instagram Login webhooks with INSTAGRAM_APP_SECRET. Try both. */
function isSignatureValid(rawBody: string, signature: string | null): boolean {
  const secrets = [optionalEnv("META_APP_SECRET"), optionalEnv("INSTAGRAM_APP_SECRET")].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) {
    if (process.env.NODE_ENV === "production") return false;
    logger.warn("webhook.unsigned_dev_mode", { hint: "Set META_APP_SECRET / INSTAGRAM_APP_SECRET to verify signatures" });
    return true;
  }
  return secrets.some((secret) => verifyMetaSignature(rawBody, signature, secret));
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    return { unserializable: true };
  }
}

function fieldOf(event: NormalizedEvent): string {
  if (event.kind === "unknown") {
    const raw = event.raw;
    if (typeof raw === "object" && raw !== null && "field" in raw && typeof (raw as { field?: unknown }).field === "string") {
      return (raw as { field: string }).field;
    }
  }
  return event.kind;
}

async function markProcessed(dedupeKey: string, error?: string): Promise<void> {
  await prisma.webhookEvent.update({ where: { dedupeKey }, data: { processed: true, error: error ?? null } });
}

async function resolveChannel(platform: ChannelPlatform, externalId: string) {
  return prisma.channel.findUnique({ where: { platform_externalId: { platform, externalId } } });
}

/** Returns true when the engine handled the event, false when it was skipped for any reason. */
async function processEvent(event: NormalizedEvent): Promise<boolean> {
  // Read receipts / delivery confirmations are high-volume telemetry we don't act on: don't persist them.
  if (event.kind === "read" || event.kind === "delivery") return false;

  const dedupeKey = webhookDedupeKey(event);
  const existing = await prisma.webhookEvent.findUnique({ where: { dedupeKey }, select: { processed: true } });
  if (existing?.processed) return false;
  if (!existing) {
    try {
      await prisma.webhookEvent.create({ data: { platform: event.platform, dedupeKey, field: fieldOf(event), payload: toJson(event.raw) } });
    } catch (err) {
      if (isUniqueViolation(err)) return false; // concurrent redelivery won the insert
      throw err;
    }
  }

  if (event.kind === "unknown") {
    await markProcessed(dedupeKey);
    return false;
  }

  const channel = await resolveChannel(event.platform, event.channelExternalId);
  if (!channel) {
    await markProcessed(dedupeKey, "channel_not_found");
    logger.info("webhook.channel_not_found", { platform: event.platform, externalId: event.channelExternalId, kind: event.kind });
    return false;
  }
  if (channel.status === ChannelStatus.DISCONNECTED) {
    await markProcessed(dedupeKey, "channel_disconnected");
    return false;
  }

  try {
    await handleIncomingEvent(channel, event);
    await markProcessed(dedupeKey);
    return true;
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    await prisma.webhookEvent.update({ where: { dedupeKey }, data: { processed: false, error: message.slice(0, 1000) } });
    logger.error("webhook.event_error", { dedupeKey, channelId: channel.id, kind: event.kind, error: message });
    return false;
  }
}

export async function processWebhookBody(rawBody: string, signature: string | null): Promise<ProcessWebhookResult> {
  try {
    if (!isSignatureValid(rawBody, signature)) {
      logger.warn("webhook.invalid_signature", { hasSignature: Boolean(signature), bytes: rawBody.length });
      return { accepted: 0, skipped: 0, reason: "invalid_signature" };
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      logger.warn("webhook.invalid_json", { bytes: rawBody.length });
      return { accepted: 0, skipped: 0, reason: "invalid_json" };
    }

    const events = normalizeWebhookPayload(body);
    let accepted = 0;
    let skipped = 0;
    for (const event of events) {
      try {
        if (await processEvent(event)) accepted++;
        else skipped++;
      } catch (err) {
        skipped++;
        logger.error("webhook.event_unhandled", { kind: event.kind, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (events.length > 0) logger.info("webhook.processed", { events: events.length, accepted, skipped });
    return { accepted, skipped };
  } catch (err) {
    logger.error("webhook.process_error", { error: err instanceof Error ? err.message : String(err) });
    return { accepted: 0, skipped: 0, reason: "error" };
  }
}
