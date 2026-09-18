/**
 * Names and attributes for the two auth cookies. Kept free of `next/headers`
 * so the Edge middleware, Node route handlers and Server Components can all
 * share one definition of what these cookies look like.
 */
import { SESSION_TTL_SECONDS } from "@/lib/auth/token";

/** The signed session: see lib/auth/token.ts for the payload. */
export const SESSION_COOKIE = "aww_session";

/**
 * The in-flight OAuth transaction (state + PKCE verifier + where to land).
 * Deleted the moment the callback consumes it.
 */
export const OAUTH_COOKIE = "aww_oauth";

/** Google has to come back within this long or the attempt is abandoned. */
const OAUTH_TTL_SECONDS = 10 * 60;

function secure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    // `lax` rather than `strict`: the browser arrives back from accounts.google.com
    // as a top-level navigation, and `strict` would withhold the cookie on it.
    sameSite: "lax" as const,
    path: "/",
    secure: secure(),
    maxAge,
  };
}

export function oauthCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: secure(), maxAge: OAUTH_TTL_SECONDS };
}

export type OAuthTransaction = {
  /** Random value echoed by Google; guards against CSRF on the callback. */
  state: string;
  /** PKCE code verifier. */
  verifier: string;
  /** Sanitized path to land on once signed in. */
  next: string;
};

export function encodeOAuthTransaction(tx: OAuthTransaction): string {
  const json = JSON.stringify(tx);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeOAuthTransaction(value: string | undefined | null): OAuthTransaction | null {
  if (!value) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<OAuthTransaction>;
    if (!parsed.state || !parsed.verifier || !parsed.next) return null;
    return { state: parsed.state, verifier: parsed.verifier, next: parsed.next };
  } catch {
    return null;
  }
}

/** Constant-time string compare for the `state` echo. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
