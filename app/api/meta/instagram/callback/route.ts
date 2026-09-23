import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/env";
import { connectInstagramAccount } from "@/lib/services/channels";

import { runOAuthCallback } from "../../_shared/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Instagram Login redirect target: exchanges the code, stores the channel, lands on /dashboard?connected=<id>. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return runOAuthCallback(req, "INSTAGRAM", async ({ state, user, code, redirectUri }) => {
    const channel = await connectInstagramAccount({ workspaceId: state.workspaceId, userId: user.id, code, redirectUri });
    const url = new URL(appUrl("/dashboard"));
    url.searchParams.set("connected", channel.id);
    return NextResponse.redirect(url);
  });
}
