import { NextResponse } from "next/server";
import { z } from "zod";

import { listChannelMedia } from "@/lib/services/automations";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const querySchema = z.object({
  channelId: z.string().min(1),
  q: z.string().max(200).optional(),
  refresh: z.enum(["1", "true"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * GET /api/automations/media?channelId=&q=&refresh=1 → { items: MediaSummary[]; refreshQueued }
 *
 * In-lane fallback for the post picker: reads the cached `Media` table and
 * (with refresh=1) queues a SYNC_MEDIA job. The channels lane's
 * GET /api/channels/[id]/media is tried first by the picker.
 */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, querySchema);
  const result = await listChannelMedia(ctx.workspace.id, query.channelId, {
    q: query.q || undefined,
    refresh: query.refresh !== undefined,
    limit: query.limit,
  });
  return NextResponse.json(result);
});
