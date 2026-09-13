import { NextResponse } from "next/server";
import { z } from "zod";

import { getUsageHistory, USAGE_HISTORY_DEFAULT_MONTHS, USAGE_HISTORY_MAX_MONTHS } from "@/lib/services/usage-history";
import { parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const querySchema = z.object({
  months: z.coerce.number().int().min(1).max(USAGE_HISTORY_MAX_MONTHS).default(USAGE_HISTORY_DEFAULT_MONTHS),
});

/**
 * GET /api/usage?months=6
 * Current billing period (used / limit / linear projection / per-channel and
 * per-automation consumption), monthly history and threshold warnings.
 */
export const GET = withWorkspace(async (req, ctx) => {
  const { months } = parseQuery(req, querySchema);
  return NextResponse.json(await getUsageHistory(ctx.organization.id, months));
});
