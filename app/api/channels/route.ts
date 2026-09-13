import { NextResponse } from "next/server";

import { listChannels, toChannelView } from "@/lib/services/channels";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** All channels in the active workspace with automation/contact/7-day DM counts and health. */
export const GET = withWorkspace(async (_req, ctx) => {
  const channels = await listChannels(ctx.workspace.id);
  return NextResponse.json({ channels: channels.map(toChannelView) });
});
