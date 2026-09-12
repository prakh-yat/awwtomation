/**
 * Meta's `signed_request` (deauthorize + data-deletion callbacks):
 * `base64url(HMAC-SHA256(payload)) + "." + base64url(json payload)`.
 * Facebook-app callbacks are signed with META_APP_SECRET; Instagram Login
 * callbacks with INSTAGRAM_APP_SECRET — both are tried.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { constantTimeEqual, hmacSha256 } from "@/lib/crypto";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const payloadSchema = z.object({
  algorithm: z.string().optional(),
  issued_at: z.number().optional(),
  user_id: z.union([z.string(), z.number()]),
});

export type SignedRequestPayload = { userId: string; issuedAt?: number };

export function metaSigningSecrets(): string[] {
  return [optionalEnv("META_APP_SECRET"), optionalEnv("INSTAGRAM_APP_SECRET")].filter((s): s is string => Boolean(s));
}

/** Returns the payload when the signature matches one of `secrets`; null otherwise. Never throws. */
export function parseSignedRequest(raw: string, secrets: string[]): SignedRequestPayload | null {
  const dot = raw.indexOf(".");
  if (dot <= 0 || secrets.length === 0) return null;
  const encodedSig = raw.slice(0, dot);
  const encodedPayload = raw.slice(dot + 1);
  if (!encodedPayload) return null;

  let sigHex: string;
  try {
    sigHex = Buffer.from(encodedSig, "base64url").toString("hex");
  } catch {
    return null;
  }
  // `hmacSha256` returns hex, so compare in hex; the signature is over the still-encoded payload.
  const valid = secrets.some((secret) => constantTimeEqual(sigHex, hmacSha256(secret, encodedPayload)));
  if (!valid) return null;

  try {
    const json: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) return null;
    if (parsed.data.algorithm && parsed.data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return { userId: String(parsed.data.user_id), issuedAt: parsed.data.issued_at };
  } catch {
    return null;
  }
}

/** Meta posts `signed_request` form-encoded; accept JSON too for manual testing. */
export async function readSignedRequest(req: NextRequest): Promise<string | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body: unknown = await req.json();
      const value = typeof body === "object" && body !== null ? (body as { signed_request?: unknown }).signed_request : undefined;
      return typeof value === "string" ? value : null;
    }
    const form = await req.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  } catch (err) {
    logger.warn("meta.signed_request_unreadable", { contentType, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Convenience: read + verify in one go. Logs why a request was rejected. */
export async function verifySignedRequest(req: NextRequest, kind: string): Promise<SignedRequestPayload | null> {
  const raw = await readSignedRequest(req);
  if (!raw) {
    logger.warn("meta.signed_request_missing", { kind });
    return null;
  }
  const secrets = metaSigningSecrets();
  if (secrets.length === 0) {
    logger.error("meta.signed_request_no_secret", { kind, hint: "Set META_APP_SECRET (and INSTAGRAM_APP_SECRET)" });
    return null;
  }
  const payload = parseSignedRequest(raw, secrets);
  if (!payload) logger.warn("meta.signed_request_invalid", { kind });
  return payload;
}
