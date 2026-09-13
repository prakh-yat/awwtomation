/**
 * Shared plumbing for the Instagram / Facebook OAuth start + callback routes.
 * Both platforms follow the same shape: sign a state bound to the workspace
 * and user, pin it with a nonce cookie, and on return verify all three before
 * touching Meta. Every failure ends in a redirect to /channels?error=… so the
 * user always lands back in the app with a toast rather than raw JSON.
 */
import type { ChannelPlatform, User } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { constantTimeEqual } from "@/lib/crypto";
import { appUrl, isMetaConfigured } from "@/lib/env";
import { categorise } from "@/lib/errors/customer-messages";
import { logger } from "@/lib/logger";
import { buildFacebookAuthUrl } from "@/lib/meta/facebook";
import { buildInstagramAuthUrl } from "@/lib/meta/instagram";
import { buildOAuthState, newOAuthNonce, parseOAuthState, type OAuthStatePayload } from "@/lib/meta/oauth-state";
import { MetaApiError } from "@/lib/meta/types";
import { canStartConnect } from "@/lib/services/channels";
import { assertMembership } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";
import type { WorkspaceContext } from "@/lib/workspace/context";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_WORKSPACE_COOKIE, activeWorkspaceCookieOptions } from "@/lib/workspace/cookie";
import { roleAtLeast } from "@/lib/workspace/permissions";

export const OAUTH_NONCE_COOKIE = "or_oauth_nonce";
const NONCE_MAX_AGE_SECONDS = 15 * 60;
/** Per-IP cap on the start routes: each hit mints a state + nonce and bounces to Meta. */
export const OAUTH_START_LIMIT_PER_MINUTE = 20;
/** Longest error detail forwarded to the channels toast; Meta's messages are one sentence. */
const MAX_REDIRECT_MESSAGE_CHARS = 200;

function nonceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    // Only the callback under /api/meta ever needs it.
    path: "/api/meta",
    maxAge: NONCE_MAX_AGE_SECONDS,
  };
}

/** The exact redirect URI registered with Meta — must match byte-for-byte between start and callback. */
export function callbackUri(platform: ChannelPlatform): string {
  return appUrl(`/api/meta/${platform.toLowerCase()}/callback`);
}

/** Redirect back to the channels page with query flags the page turns into toasts. */
export function channelsRedirect(params: Record<string, string | undefined> = {}): NextResponse {
  const url = new URL(appUrl("/channels"));
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function clearNonce(res: NextResponse): NextResponse {
  res.cookies.set(OAUTH_NONCE_COOKIE, "", { ...nonceCookieOptions(), maxAge: 0 });
  return res;
}

/**
 * Only our own `ApiError` text and the customer copy for a Meta error ever
 * reach the `?message=` toast, and both are rendered as plain text by React. Control
 * characters are stripped and the length capped anyway so a pathological
 * upstream message can't be turned into a multi-line phishing toast.
 */
function safeMessage(message: string): string | undefined {
  const cleaned = message.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > MAX_REDIRECT_MESSAGE_CHARS ? `${cleaned.slice(0, MAX_REDIRECT_MESSAGE_CHARS - 1)}…` : cleaned;
}

function errorRedirect(err: unknown, platform: ChannelPlatform): NextResponse {
  if (err instanceof ApiError) {
    return channelsRedirect({ error: (err.code ?? "error").toLowerCase(), message: safeMessage(err.message) });
  }
  if (err instanceof MetaApiError) {
    logger.warn("meta.oauth_callback_meta_error", { platform, code: err.code, subcode: err.subcode, message: err.message });
    // Meta's own wording stays in the logs; the toast gets the translated explanation.
    return channelsRedirect({ error: "meta", message: safeMessage(categorise(err).description) });
  }
  logger.error("meta.oauth_callback_failed", { platform, error: err });
  return channelsRedirect({ error: "unknown" });
}

/**
 * GET /api/meta/{platform}/start. Runs inside `withWorkspace`, but role and
 * plan failures redirect (with a toast) instead of returning JSON because
 * this URL is reached by a plain link click.
 */
export async function startOAuth(ctx: WorkspaceContext, platform: ChannelPlatform): Promise<NextResponse> {
  if (!roleAtLeast(ctx.role, "ADMIN")) return channelsRedirect({ error: "forbidden" });

  const configured = isMetaConfigured();
  const ready = platform === "INSTAGRAM" ? configured.instagram : configured.facebook;
  if (!ready) return channelsRedirect({ error: "not_configured", platform: platform.toLowerCase() });

  if (!(await canStartConnect(ctx.workspace.id, platform))) return channelsRedirect({ error: "plan_limit" });

  const nonce = newOAuthNonce();
  const state = buildOAuthState({ workspaceId: ctx.workspace.id, userId: ctx.user.id, platform, nonce });
  const redirectUri = callbackUri(platform);
  const authUrl = platform === "INSTAGRAM" ? buildInstagramAuthUrl(state, redirectUri) : buildFacebookAuthUrl(state, redirectUri);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, nonceCookieOptions());
  logger.info("meta.oauth_started", { platform, workspaceId: ctx.workspace.id, userId: ctx.user.id });
  return res;
}

export type AuthorizedCallback = {
  state: OAuthStatePayload;
  user: User;
  code: string;
  redirectUri: string;
};

/**
 * GET /api/meta/{platform}/callback. Verifies Meta's `?error`, the signed
 * state, the nonce cookie, the signed-in user and their ADMIN+ membership
 * of the workspace named in the state, then hands off to `onAuthorized`.
 * The active-workspace cookie is pointed at that workspace so the redirect
 * target renders the channel that was just connected.
 */
export async function runOAuthCallback(
  req: NextRequest,
  platform: ChannelPlatform,
  onAuthorized: (ctx: AuthorizedCallback) => Promise<NextResponse>,
): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;

  const metaError = params.get("error");
  if (metaError) {
    logger.info("meta.oauth_denied", { platform, error: metaError, reason: params.get("error_reason"), description: params.get("error_description") });
    return clearNonce(channelsRedirect({ error: "denied" }));
  }

  const code = params.get("code");
  const rawState = params.get("state");
  if (!code || !rawState) return clearNonce(channelsRedirect({ error: "invalid_state" }));

  let state: OAuthStatePayload;
  try {
    state = parseOAuthState(rawState);
  } catch (err) {
    logger.warn("meta.oauth_bad_state", { platform, error: err instanceof Error ? err.message : String(err) });
    return clearNonce(channelsRedirect({ error: "invalid_state" }));
  }
  if (state.platform !== platform) return clearNonce(channelsRedirect({ error: "invalid_state" }));

  const nonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value;
  if (!nonce || !constantTimeEqual(nonce, state.nonce)) {
    logger.warn("meta.oauth_nonce_mismatch", { platform, hasCookie: Boolean(nonce) });
    return clearNonce(channelsRedirect({ error: "invalid_state" }));
  }

  const user = await getCurrentUser();
  if (!user) return clearNonce(NextResponse.redirect(appUrl("/login?next=%2Fchannels")));
  if (user.id !== state.userId) return clearNonce(channelsRedirect({ error: "session" }));

  const access = await assertMembership(state.workspaceId, user.id, "MEMBER").catch(() => null);
  if (!access || !roleAtLeast(access.role, "ADMIN")) return clearNonce(channelsRedirect({ error: "forbidden" }));

  try {
    const res = await onAuthorized({ state, user, code, redirectUri: callbackUri(platform) });
    res.cookies.set(ACTIVE_ORGANIZATION_COOKIE, access.workspace.organizationId, activeWorkspaceCookieOptions());
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, state.workspaceId, activeWorkspaceCookieOptions());
    return clearNonce(res);
  } catch (err) {
    return clearNonce(errorRedirect(err, platform));
  }
}
