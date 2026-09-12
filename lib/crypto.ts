import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM helpers for secrets at rest (Meta access tokens).
 * Storage format: base64(iv[12] || ciphertext || authTag[16]).
 */
function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  // Accept base64 (preferred) or hex.
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32)");
  return buf;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256(secret: string, input: string | Buffer): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Sign a small JSON state blob (OAuth `state`, invite tokens). */
export function signState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmacSha256(key().toString("base64"), body);
  return `${body}.${sig}`;
}

export function verifyState<T = Record<string, unknown>>(state: string, maxAgeSeconds = 900): T {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Malformed state");
  const expected = hmacSha256(key().toString("base64"), body);
  if (!constantTimeEqual(sig, expected)) throw new Error("Invalid state signature");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { iat?: number };
  if (typeof parsed.iat === "number" && Math.floor(Date.now() / 1000) - parsed.iat > maxAgeSeconds) {
    throw new Error("State expired");
  }
  return parsed;
}
