/**
 * The signed session cookie payload.
 *
 * We are our own identity provider now, so the session is a small
 * HMAC-SHA256-signed token rather than a third party's JWT: `base64url(json).signature`.
 *
 * Everything here uses Web Crypto and `atob`/`btoa` rather than `node:crypto`
 * and `Buffer`, because `middleware.ts` runs on the Edge runtime and has to
 * verify the same token that the Node route handlers mint.
 */

/** 30 days. Long enough that nobody re-authenticates weekly; short enough to matter. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Re-issue the cookie once it is older than this, so active users never expire. */
const REFRESH_AFTER_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  /** `User.id` in our database. */
  uid: string;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns `Uint8Array<ArrayBuffer>` rather than the default `ArrayBufferLike`,
// which `crypto.subtle` will not accept as a `BufferSource`.
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Importing the key is not free, and middleware verifies on nearly every
 * request, so keep the imported key for the life of the isolate.
 */
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function signingKey(): Promise<CryptoKey> {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) throw new Error("APP_ENCRYPTION_KEY is not set — it signs the session cookie");
  // Re-import if the secret was rotated in-process (tests); otherwise reuse.
  if (cachedKey?.secret === secret) return cachedKey.key;
  const key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
  cachedKey = { secret, key };
  return key;
}

/** Mints the cookie value for a signed-in user. */
export async function signSession(userId: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload: SessionPayload = { uid: userId, iat: now, exp: now + SESSION_TTL_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Returns the payload for a token that is both correctly signed and unexpired,
 * or null. Never throws on malformed input — a stale or hand-edited cookie is
 * an ordinary signed-out visitor, not an error.
 */
export async function verifySession(
  token: string | undefined | null,
  now = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      fromBase64Url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;

    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Partial<SessionPayload>;
    if (typeof parsed.uid !== "string" || !parsed.uid) return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= now) return null;
    if (typeof parsed.iat !== "number") return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

/** True once the token is old enough that middleware should mint a fresh one. */
export function shouldRefresh(payload: SessionPayload, now = Math.floor(Date.now() / 1000)): boolean {
  return now - payload.iat > REFRESH_AFTER_SECONDS;
}
