import { NextResponse } from "next/server";
import { z } from "zod";

import { listChannelMedia } from "@/lib/services/channels";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

const mediaQuerySchema = z.object({
  /** Case-insensitive caption search. */
  q: z.string().max(200).optional(),
  /** `1` / `true` re-syncs from Meta before answering. */
  refresh: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * Cached posts/reels for the post picker.
 * Response: `{ media: Array<{ id, externalId, caption, mediaType, thumbnailUrl, mediaUrl, permalink, timestamp, commentCount, likeCount }>, syncedAt }`.
 */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const query = parseQuery(req, mediaQuerySchema);
  const result = await listChannelMedia(ctx.workspace.id, id, {
    q: query.q,
    limit: query.limit,
    refresh: query.refresh === "1" || query.refresh === "true",
  });
  return NextResponse.json(result);
});
