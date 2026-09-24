/**
 * OAuth 2.1 authorization server for the MCP endpoint (/mcp).
 *
 * An AI app (Claude, ChatGPT, Cursor) registers itself at /oauth/register
 * (RFC 7591) the moment someone pastes the MCP URL into it, so nobody ever
 * copies a client id or secret by hand. The person approves it on
 * /oauth/authorize, and the app trades the code for tokens at /oauth/token.
 *
 * Every secret is stored as a sha256 hash: client secrets, codes, access and
 * refresh tokens. Access tokens are opaque and live an hour, so disconnecting
 * an app from Settings takes effect on its next call. What a token may reach is
 * decided live on every request by `lib/services/mcp-access.ts`.
 *
 * This is not Meta's or Google's OAuth: those are in lib/meta and lib/auth.
 */
import { createHash } from "node:crypto";
import { OAuthTokenKind, type OAuthClient } from "@prisma/client";
import { z } from "zod";

import { brand } from "@/lib/brand";
import { constantTimeEqual, randomToken, sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

export const OAUTH_SCOPE = "mcp";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;
const CODE_TTL_SECONDS = 10 * 60;
/** Expired rows are kept a day for replay detection and support, then purged. */
const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;

const ACCESS_TOKEN_PREFIX = "aww_at_";
const REFRESH_TOKEN_PREFIX = "aww_rt_";

// ───────────────────────── Errors ─────────────────────────

/** An RFC 6749 error: `code` is the wire value (`invalid_grant`), `description` a sentence. */
export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
    this.name = "OAuthError";
  }

  toBody(): { error: string; error_description: string } {
    return { error: this.code, error_description: this.description };
  }
}

// ───────────────────────── Identity ─────────────────────────

/** The app's public origin: the issuer, and the base of every endpoint below. */
export function oauthIssuer(): string {
  return appUrl("/").replace(/\/$/, "");
}

/** The protected resource the tokens are for. Also the URL people paste into their AI app. */
export function mcpServerUrl(): string {
  return `${oauthIssuer()}/mcp`;
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata() {
  const issuer = oauthIssuer();
  const authMethods = ["client_secret_post", "client_secret_basic", "none"];
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: authMethods,
    revocation_endpoint_auth_methods_supported: authMethods,
    scopes_supported: [OAUTH_SCOPE],
    service_documentation: `${issuer}/settings/mcp`,
  };
}

/** RFC 9728 protected resource metadata, pointed to by the 401 from /mcp. */
export function protectedResourceMetadata() {
  const issuer = oauthIssuer();
  return {
    resource: mcpServerUrl(),
    resource_name: brand.name,
    authorization_servers: [issuer],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${issuer}/settings/mcp`,
  };
}

/**
 * RFC 8707: an app may name the resource it wants a token for. Ours is the MCP
 * endpoint; anything else is refused rather than silently ignored. The host is
 * not compared, because an app may reach us through a proxy or a preview URL.
 */
export function isOwnResource(resource: string | null | undefined): boolean {
  if (!resource) return true;
  try {
    const path = new URL(resource).pathname.replace(/\/+$/, "");
    return path === "/mcp";
  } catch {
    return false;
  }
}

// ───────────────────────── Redirect URIs ─────────────────────────

const REFUSED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

function isLoopback(url: URL): boolean {
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
}

/**
 * Registration-time check. https anywhere, http only to a loopback address,
 * and an app's own scheme (cursor://, vscode://) as long as it is not one that
 * runs code. The URI is then exact-matched at authorize and token time.
 */
function assertRegistrableRedirect(uri: string): void {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new OAuthError("invalid_redirect_uri", `Not a valid redirect URI: ${uri}`);
  }
  if (url.hash) throw new OAuthError("invalid_redirect_uri", "Redirect URIs cannot contain a fragment.");
  if (REFUSED_SCHEMES.has(url.protocol)) throw new OAuthError("invalid_redirect_uri", `That redirect scheme is not allowed: ${url.protocol}`);
  if (url.protocol === "http:" && !isLoopback(url)) {
    throw new OAuthError("invalid_redirect_uri", "Plain http redirects are only allowed to localhost.");
  }
}

/** Loopback redirects may use any port (RFC 8252 section 7.3); everything else must match exactly. */
function canonicalRedirect(uri: string): string {
  const url = new URL(uri);
  const port = isLoopback(url) ? "" : url.port;
  return `${url.protocol}//${url.hostname}${port ? `:${port}` : ""}${url.pathname}${url.search}`;
}

export function isRegisteredRedirect(client: Pick<OAuthClient, "redirectUris">, uri: string): boolean {
  let target: string;
  try {
    target = canonicalRedirect(uri);
  } catch {
    return false;
  }
  return client.redirectUris.some((registered) => {
    try {
      return canonicalRedirect(registered) === target;
    } catch {
      return false;
    }
  });
}

/** The host a consent screen should name, so a lookalike app is easier to spot. */
export function redirectHost(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || `${url.protocol}//`;
  } catch {
    return uri;
  }
}

// ───────────────────────── Clients (RFC 7591) ─────────────────────────

const AUTH_METHODS = ["client_secret_post", "client_secret_basic", "none"] as const;

export const clientRegistrationSchema = z
  .object({
    client_name: z.string().trim().max(200).optional(),
    client_uri: z.string().trim().max(500).optional(),
    redirect_uris: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
    grant_types: z.array(z.string().max(100)).max(10).optional(),
    response_types: z.array(z.string().max(100)).max(10).optional(),
    token_endpoint_auth_method: z.string().max(100).optional(),
    scope: z.string().max(500).optional(),
  })
  .passthrough();

export type ClientRegistration = z.infer<typeof clientRegistrationSchema>;

export type ClientRegistrationResponse = {
  client_id: string;
  client_secret?: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  client_name: string;
  client_uri?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
};

function httpUrlOrUndefined(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Registers an app. A confidential client gets its secret once, in this response. */
export async function registerClient(input: ClientRegistration): Promise<ClientRegistrationResponse> {
  for (const uri of input.redirect_uris) assertRegistrableRedirect(uri);

  const method = input.token_endpoint_auth_method ?? "client_secret_post";
  if (!(AUTH_METHODS as readonly string[]).includes(method)) {
    throw new OAuthError("invalid_client_metadata", `Unsupported token_endpoint_auth_method: ${method}`);
  }
  const grantTypes = (input.grant_types ?? ["authorization_code", "refresh_token"]).filter((g) => g === "authorization_code" || g === "refresh_token");
  if (!grantTypes.includes("authorization_code")) {
    throw new OAuthError("invalid_client_metadata", "grant_types must include authorization_code.");
  }
  if (input.response_types && !input.response_types.includes("code")) {
    throw new OAuthError("invalid_client_metadata", "response_types must include code.");
  }

  const clientId = `aww_client_${randomToken(16)}`;
  const clientSecret = method === "none" ? undefined : `aww_secret_${randomToken(32)}`;
  const clientName = input.client_name?.trim() || "AI app";
  const clientUri = httpUrlOrUndefined(input.client_uri);

  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash: clientSecret ? sha256(clientSecret) : "",
      clientName,
      clientUri: clientUri ?? null,
      redirectUris: input.redirect_uris,
      tokenEndpointAuthMethod: method,
    },
  });
  logger.info("oauth.client_registered", { clientId, clientName, method });

  return {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    client_name: clientName,
    ...(clientUri ? { client_uri: clientUri } : {}),
    redirect_uris: input.redirect_uris,
    grant_types: grantTypes,
    response_types: ["code"],
    token_endpoint_auth_method: method,
    scope: OAUTH_SCOPE,
  };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 200) return null;
  return prisma.oAuthClient.findUnique({ where: { clientId } });
}

/**
 * Token and revocation endpoints: a public client proves nothing here (PKCE
 * already bound the code to it), a confidential one must present its secret.
 */
export async function authenticateClient(clientId: string | null, clientSecret: string | null): Promise<OAuthClient | null> {
  if (!clientId) return null;
  const client = await getClient(clientId);
  if (!client) return null;
  if (client.tokenEndpointAuthMethod === "none") return client;
  if (!clientSecret || !client.clientSecretHash) return null;
  return constantTimeEqual(sha256(clientSecret), client.clientSecretHash) ? client : null;
}

// ───────────────────────── Authorization codes ─────────────────────────

const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!CODE_VERIFIER_RE.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return constantTimeEqual(computed, challenge);
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const code = randomToken(32);
  await prisma.oAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

/** Spends a code exactly once. A second use is treated as theft: every token of that person and app is revoked. */
async function redeemAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<{ userId: string }> {
  const record = await prisma.oAuthCode.findUnique({ where: { codeHash: sha256(input.code) } });
  if (!record) throw new OAuthError("invalid_grant", "Unknown authorization code.");
  if (record.consumedAt) {
    await revokeTokensFor(record.userId, record.clientId);
    throw new OAuthError("invalid_grant", "Authorization code already used.");
  }
  if (record.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Authorization code expired.");
  if (record.clientId !== input.clientId) throw new OAuthError("invalid_grant", "Authorization code was issued to another client.");
  if (record.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request.");
  if (!pkceMatches(input.codeVerifier, record.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed.");

  // Compare-and-swap: of two concurrent redemptions exactly one flips the row.
  const consumed = await prisma.oAuthCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new OAuthError("invalid_grant", "Authorization code already used.");
  return { userId: record.userId };
}

// ───────────────────────── Tokens ─────────────────────────

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function issueTokens(userId: string, clientId: string, rotatedFromId?: string): Promise<TokenResponse> {
  const accessToken = `${ACCESS_TOKEN_PREFIX}${randomToken(32)}`;
  const refreshToken = `${REFRESH_TOKEN_PREFIX}${randomToken(32)}`;
  const now = Date.now();
  await prisma.oAuthToken.createMany({
    data: [
      {
        tokenHash: sha256(accessToken),
        kind: OAuthTokenKind.ACCESS,
        clientId,
        userId,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
        rotatedFromId: rotatedFromId ?? null,
      },
      {
        tokenHash: sha256(refreshToken),
        kind: OAuthTokenKind.REFRESH,
        clientId,
        userId,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
        rotatedFromId: rotatedFromId ?? null,
      },
    ],
  });
  await prisma.oAuthClient.update({ where: { clientId }, data: { lastUsedAt: new Date(now) } }).catch(() => undefined);
  return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken, scope: OAUTH_SCOPE };
}

/** authorization_code grant. */
export async function exchangeAuthorizationCode(input: {
  client: OAuthClient;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const { userId } = await redeemAuthorizationCode({
    code: input.code,
    clientId: input.client.clientId,
    redirectUri: input.redirectUri,
    codeVerifier: input.codeVerifier,
  });
  const tokens = await issueTokens(userId, input.client.clientId);
  logger.info("oauth.token_issued", { clientId: input.client.clientId, userId, grant: "authorization_code" });
  return tokens;
}

/**
 * refresh_token grant, with rotation. Presenting a token that was already
 * rotated means two parties hold it, so the whole chain is revoked and the
 * person signs in again. A refresh is also refused once the person has
 * disconnected the app everywhere, so it cannot quietly come back.
 */
export async function refreshAccessToken(input: {
  client: OAuthClient;
  refreshToken: string;
  hasLiveAccess: (userId: string, clientId: string) => Promise<boolean>;
}): Promise<TokenResponse> {
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256(input.refreshToken) } });
  if (!row || row.kind !== OAuthTokenKind.REFRESH) throw new OAuthError("invalid_grant", "Unknown refresh token.");
  if (row.clientId !== input.client.clientId) throw new OAuthError("invalid_grant", "Refresh token was issued to another client.");
  if (!(await input.hasLiveAccess(row.userId, row.clientId))) {
    await revokeTokensFor(row.userId, row.clientId);
    throw new OAuthError("invalid_grant", "This app was disconnected. Connect it again.");
  }
  if (row.revokedAt) {
    await revokeTokensFor(row.userId, row.clientId);
    throw new OAuthError("invalid_grant", "Refresh token already used.");
  }
  if (row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Refresh token expired.");

  const rotated = await prisma.oAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  // Lost a race with a concurrent refresh of the same token: that one already has its successor.
  if (rotated.count !== 1) throw new OAuthError("invalid_grant", "Refresh token already used.");
  return issueTokens(row.userId, row.clientId, row.id);
}

/** Every live token of one person and one app, e.g. on disconnect or when a replay is detected. */
export async function revokeTokensFor(userId: string, clientId: string): Promise<number> {
  const result = await prisma.oAuthToken.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count > 0) logger.info("oauth.tokens_revoked", { userId, clientId, count: result.count });
  return result.count;
}

/**
 * RFC 7009. Revoking either token ends the app's session for that person, as
 * the spec suggests for a refresh token. Unknown tokens are not an error, so
 * the endpoint cannot be used to test whether a token exists.
 */
export async function revokeToken(token: string, clientId: string): Promise<void> {
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256(token) }, select: { userId: true, clientId: true } });
  if (!row || row.clientId !== clientId) return;
  await revokeTokensFor(row.userId, row.clientId);
}

/** Who a bearer token on /mcp belongs to, or null when it is unknown, revoked or expired. */
export async function authenticateAccessToken(token: string): Promise<{ userId: string; clientId: string } | null> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX) || token.length > 200) return null;
  const row = await prisma.oAuthToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { kind: true, userId: true, clientId: true, expiresAt: true, revokedAt: true },
  });
  if (!row || row.kind !== OAuthTokenKind.ACCESS || row.revokedAt || row.expiresAt.getTime() < Date.now()) return null;
  return { userId: row.userId, clientId: row.clientId };
}

/** Housekeeping for the cron tick: codes and tokens that expired more than a day ago. */
export async function purgeExpiredOAuthRows(now = new Date()): Promise<{ codes: number; tokens: number }> {
  const cutoff = new Date(now.getTime() - PURGE_GRACE_MS);
  const [codes, tokens] = await Promise.all([
    prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    prisma.oAuthToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
  ]);
  return { codes: codes.count, tokens: tokens.count };
}
