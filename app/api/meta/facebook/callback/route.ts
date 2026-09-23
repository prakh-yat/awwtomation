import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/env";
import {
  beginFacebookConnect,
  createFacebookConnectSession,
  FACEBOOK_CONNECT_COOKIE,
  FACEBOOK_CONNECT_MAX_AGE_SECONDS,
} from "@/lib/services/channels";

import { accountsRedirect, runOAuthCallback } from "../../_shared/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function facebookConnectCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: FACEBOOK_CONNECT_MAX_AGE_SECONDS,
  };
}

/**
 * Facebook Login redirect target. A user may manage many Pages, so the
 * long-lived user token is parked in a short-lived signed cookie and the
 * user picks Pages on /channels/select-pages (completed by
 * POST /api/channels/facebook/select).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return runOAuthCallback(req, "FACEBOOK", async ({ state, user, code, redirectUri }) => {
    const { userToken, pages } = await beginFacebookConnect({ code, redirectUri });
    if (pages.length === 0) return accountsRedirect({ error: "no_pages" });

    const res = NextResponse.redirect(appUrl("/channels/select-pages"));
    res.cookies.set(
      FACEBOOK_CONNECT_COOKIE,
      createFacebookConnectSession({ workspaceId: state.workspaceId, userId: user.id, userToken }),
      facebookConnectCookieOptions(),
    );
    return res;
  });
}
