/**
 * Google OAuth 2.0 / OpenID Connect: the app talks to Google directly.
 *
 * Authorization Code flow with PKCE. The only two secrets involved are
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a "Web application" OAuth
 * client in Google Cloud Console; the redirect URI registered there must match
 * `googleRedirectUri()` below exactly, byte for byte.
 */
import { logger } from "@/lib/logger";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Google signs `id_token`s with either spelling of the issuer. */
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export type GoogleCredentials = { clientId: string; clientSecret: string };

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleCredentials(): GoogleCredentials {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Google sign-in (see .env.example)",
    );
  }
  return { clientId, clientSecret };
}

/**
 * The one redirect URI, derived from a single source of truth so the authorize
 * request and the token exchange can never disagree: Google rejects the
 * exchange with `redirect_uri_mismatch` if they do.
 */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/auth/callback`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export type PkcePair = { verifier: string; challenge: string };

/** S256 PKCE, so an intercepted `?code=` is useless without our verifier. */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomBase64Url(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
}

export function createState(): string {
  return randomBase64Url(24);
}

export function buildAuthorizeUrl(options: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const { clientId } = googleCredentials();
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Always offer the account chooser: people signing in to a work tool often
  // have the wrong Google account active in the browser.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

type TokenResponse = { id_token?: string; access_token?: string; error?: string; error_description?: string };

/** Exchanges the one-time `?code` for tokens. Returns the raw `id_token`. */
export async function exchangeCodeForIdToken(options: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<string> {
  const { clientId, clientSecret } = googleCredentials();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code: options.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
      code_verifier: options.codeVerifier,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || payload.error || !payload.id_token) {
    // `error_description` names our own misconfiguration (bad secret, mismatched
    // redirect URI): worth logging, never worth showing the visitor.
    logger.warn("auth.google.token_exchange_failed", {
      status: response.status,
      error: payload.error,
      description: payload.error_description,
    });
    throw new Error("Google token exchange failed");
  }
  return payload.id_token;
}

export type GoogleIdentity = {
  /** Google's stable per-user id (`sub`): never reused, never changes. */
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Reads the identity out of Google's `id_token`.
 *
 * The signature is deliberately not re-verified: we received this token in the
 * body of a direct, TLS-authenticated POST to Google's token endpoint using our
 * client secret, which is the case Google's own documentation calls out as not
 * requiring validation. The claims below still get checked, because a valid
 * token issued for a *different* client would otherwise be accepted.
 */
export function readIdentity(idToken: string, now = Math.floor(Date.now() / 1000)): GoogleIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed Google id_token");

  const claims = decodeSegment(parts[1]) as Record<string, unknown>;
  const { clientId } = googleCredentials();

  const issuer = pickString(claims.iss);
  if (!issuer || !ISSUERS.has(issuer)) throw new Error("Google id_token has an unexpected issuer");

  const audience = pickString(claims.aud);
  if (audience !== clientId) throw new Error("Google id_token was issued for a different client");

  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("Google id_token has expired");

  const subject = pickString(claims.sub);
  const email = pickString(claims.email)?.toLowerCase() ?? null;
  if (!subject || !email) throw new Error("Google id_token is missing sub/email");

  // Google only omits this for some Workspace configurations; an unverified
  // address must not be allowed to claim an account keyed by email.
  if (claims.email_verified === false) throw new Error("Google email address is not verified");

  return {
    subject,
    email,
    name: pickString(claims.name) ?? pickString(claims.given_name),
    avatarUrl: pickString(claims.picture),
  };
}

/** How `User.authId` is spelled for a Google identity. */
export function googleAuthId(subject: string): string {
  return `google:${subject}`;
}
