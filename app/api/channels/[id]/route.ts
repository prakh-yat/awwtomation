import { NextResponse } from "next/server";

import { disconnectChannel, getChannelSummary, purgeChannel, toChannelView } from "@/lib/services/channels";
import { ApiError, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

export const GET = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const channel = await getChannelSummary(ctx.workspace.id, id);
  if (!channel) throw new ApiError(404, "Channel not found", "NOT_FOUND");
  return NextResponse.json({ channel: toChannelView(channel) });
});

/**
 * DELETE /api/channels/[id] — disconnect (ADMIN+): keeps contacts, conversations
 * and automations; destroys the token. → { ok, channel }
 * DELETE /api/channels/[id]?purge=1 — delete channel & data (OWNER only): removes
 * the channel and everything cascading from it. → { ok, purged: true, id, counts }
 */
export const DELETE = withWorkspace<Params>(
  async (req, ctx, { params }) => {
    const { id } = await params;

    if (req.nextUrl.searchParams.get("purge") === "1") {
      if (ctx.role !== "OWNER") {
        throw new ApiError(403, "Only the workspace owner can delete a channel and its data", "FORBIDDEN");
      }
      const result = await purgeChannel(ctx.workspace.id, id, ctx.user.id);
      return NextResponse.json({ ok: true, purged: true, ...result });
    }

    const channel = await disconnectChannel(ctx.workspace.id, id, ctx.user.id);
    return NextResponse.json({ ok: true, channel: toChannelView(channel) });
  },
  { minRole: "ADMIN" },
);
