/**
 * Stored webhook events: how an event is written down, read back, and claimed
 * by whoever processes it.
 *
 * The webhook route stores every event it accepts and hands it to the queue
 * (PROCESS_WEBHOOK), and the reconcile poll feeds comments the webhook never
 * delivered through the same row. Both paths claim the row first: a claim is a
 * short lease on `claimedAt`, taken atomically, so the same event is never
 * handled by two processes at once. Finishing marks it processed; letting go
 * without finishing (the account needs reconnecting, the handler threw) clears
 * the lease so a later attempt can have it.
 */
import { Prisma, type ChannelPlatform } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { NormalizedEvent } from "@/lib/meta/types";
import { webhookDedupeKey } from "@/lib/meta/webhook";

/** Long enough for any one event to be handled; a crashed holder's lease runs out after it. */
export const WEBHOOK_LEASE_MS = 5 * 60_000;

/** The normalized event as stored: every Date as an ISO string, `raw` left as Meta sent it. */
export type SerializedEvent = Omit<Extract<NormalizedEvent, { timestamp: Date }>, "timestamp" | "raw"> & { timestamp: string };

/** `WebhookEvent.payload` for rows written from this version on. */
export type StoredWebhookPayload = { v: 2; event: SerializedEvent; raw: unknown };

type ActionableEvent = Extract<NormalizedEvent, { kind: "comment" | "message" | "postback" }>;

export function isActionable(event: NormalizedEvent): event is ActionableEvent {
  return event.kind === "comment" || event.kind === "message" || event.kind === "postback";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    return { unserializable: true };
  }
}

export function serializeEvent(event: ActionableEvent): StoredWebhookPayload {
  const { raw, timestamp, ...rest } = event;
  return { v: 2, event: { ...rest, timestamp: timestamp.toISOString() } as SerializedEvent, raw };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The event a stored payload describes, or null for a row written before
 * payloads carried the normalized event (those only kept Meta's raw entry and
 * were processed inline when they arrived).
 */
export function deserializeEvent(payload: unknown): ActionableEvent | null {
  if (!isRecord(payload) || payload.v !== 2 || !isRecord(payload.event)) return null;
  const event = payload.event as Record<string, unknown>;
  if (event.kind !== "comment" && event.kind !== "message" && event.kind !== "postback") return null;
  const timestamp = typeof event.timestamp === "string" ? new Date(event.timestamp) : null;
  if (!timestamp || Number.isNaN(timestamp.getTime())) return null;
  return { ...event, timestamp, raw: payload.raw } as unknown as ActionableEvent;
}

/**
 * Stores the event once. `created` is false when a row with its dedupe key
 * already exists (Meta redelivered it, or reconcile found it first).
 */
export async function recordWebhookEvent(
  event: ActionableEvent,
  field: string,
): Promise<{ created: boolean; dedupeKey: string; processed: boolean }> {
  const dedupeKey = webhookDedupeKey(event);
  try {
    await prisma.webhookEvent.create({
      data: { platform: event.platform as ChannelPlatform, dedupeKey, field, payload: toJson(serializeEvent(event)) },
    });
    return { created: true, dedupeKey, processed: false };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    const existing = await prisma.webhookEvent.findUnique({ where: { dedupeKey }, select: { processed: true } });
    return { created: false, dedupeKey, processed: existing?.processed ?? true };
  }
}

export type ClaimedWebhookEvent = { id: string; dedupeKey: string; payload: Prisma.JsonValue; createdAt: Date };

/**
 * Takes the lease on an unprocessed event. Null when it is already processed,
 * missing, or someone else holds a live lease.
 */
export async function claimWebhookEvent(dedupeKey: string, leaseMs = WEBHOOK_LEASE_MS): Promise<ClaimedWebhookEvent | null> {
  const staleBefore = new Date(Date.now() - leaseMs).toISOString();
  const rows = await prisma.$queryRaw<ClaimedWebhookEvent[]>(Prisma.sql`
    UPDATE "WebhookEvent"
    SET "claimedAt" = NOW()
    WHERE "dedupeKey" = ${dedupeKey}
      AND "processed" = false
      AND ("claimedAt" IS NULL OR "claimedAt" < ${staleBefore}::timestamp)
    RETURNING "id", "dedupeKey", "payload", "createdAt"
  `);
  return rows[0] ?? null;
}

/** Done with it: processed for good. `note` records why nothing was done (no such account, disconnected). */
export async function completeWebhookEvent(dedupeKey: string, note?: string): Promise<void> {
  await prisma.webhookEvent.update({ where: { dedupeKey }, data: { processed: true, claimedAt: null, error: note ?? null } });
}

/** Lets go without finishing, so the next attempt (a job retry, a reconcile pass after reconnecting) can take it. */
export async function releaseWebhookEvent(dedupeKey: string, error: string): Promise<void> {
  await prisma.webhookEvent.update({ where: { dedupeKey }, data: { processed: false, claimedAt: null, error: error.slice(0, 1000) } });
}
