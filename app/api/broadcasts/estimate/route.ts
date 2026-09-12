import { NextResponse } from "next/server";

import { audienceForEstimate, estimateAudience, estimateAudienceSchema } from "@/lib/services/broadcasts";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/broadcasts/estimate { channelId, audience?: { tags?, tagMode?, excludeTags?, onlyFollowers?, lastInteractionDays?, q? }, segmentId? }
 * → { total, eligible, skippedWindow, audience }. Drives the editor's live "N eligible now" card.
 * `segmentId` estimates that segment's saved filters instead; the resolved audience is echoed back.
 */
export const POST = withWorkspace(async (req, ctx) => {
  const { channelId, audience: given, segmentId } = await parseBody(req, estimateAudienceSchema);
  const audience = await audienceForEstimate(ctx.workspace.id, { audience: given, segmentId });
  const estimate = await estimateAudience(ctx.workspace.id, channelId, audience);
  return NextResponse.json({ ...estimate, audience });
});
