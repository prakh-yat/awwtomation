import { NextResponse } from "next/server";
import { z } from "zod";

import { MetaApiError } from "@/lib/meta/types";
import {
  completeFacebookConnect,
  FACEBOOK_CONNECT_COOKIE,
  parseFacebookConnectSession,
  type ChannelSummary,
} from "@/lib/services/channels";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const bodySchema = z.object({
  pageIds: z.array(z.string().min(1).max(64)).min(1, "Pick at least one Page").max(50),
});

/**
 * Step 2 of the Facebook flow. Body: `{ pageIds: string[] }`. Reads the
 * picker cookie set by the OAuth callback; it must belong to the same user
 * and workspace. Responds `{ channels: ChannelSummary[] }` and clears the cookie.
 */
export const POST = withWorkspace(
  async (req, ctx) => {
    const { pageIds } = await parseBody(req, bodySchema);

    const session = parseFacebookConnectSession(req.cookies.get(FACEBOOK_CONNECT_COOKIE)?.value);
    if (!session || session.workspaceId !== ctx.workspace.id || session.userId !== ctx.user.id) {
      throw new ApiError(410, "Your Facebook sign-in has expired. Start the connection again.", "FB_SESSION_EXPIRED");
    }

    let channels: ChannelSummary[];
    try {
      channels = await completeFacebookConnect({ workspaceId: ctx.workspace.id, userId: ctx.user.id, userToken: session.userToken, pageIds });
    } catch (err) {
      if (err instanceof MetaApiError) throw new ApiError(502, `Meta returned an error: ${err.message}`, "META_ERROR");
      throw err;
    }

    const res = NextResponse.json({ channels }, { status: 201 });
    res.cookies.set(FACEBOOK_CONNECT_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  },
  { minRole: "ADMIN" },
);
