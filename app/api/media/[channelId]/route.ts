import { NextResponse } from "next/server";
import { z } from "zod";

import { listChannelMedia } from "@/lib/services/channels";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { channelId: string };

const querySchema = z.object({
  q: z.string().max(200).optional(),
  refresh: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Alias of GET /api/channels/[id]/media — identical response shape. */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { channelId } = await params;
  const query = parseQuery(req, querySchema);
  const result = await listChannelMedia(ctx.workspace.id, channelId, {
    q: query.q,
    limit: query.limit,
    refresh: query.refresh === "1" || query.refresh === "true",
  });
  return NextResponse.json(result);
});
