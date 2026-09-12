import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { findChannelsNeedingRefresh, refreshChannelTokenIfNeeded } from "@/lib/meta/tokens";
import { authorizeCron, cronError } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_RUN = 50;

/** Daily: refresh Instagram tokens with < 10 days left. Runs inline so it works without a worker. */
async function refreshTokens(req: Request): Promise<NextResponse> {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    const channels = await findChannelsNeedingRefresh();
    let refreshed = 0;
    let skipped = 0;
    let failed = 0;
    for (const channel of channels.slice(0, MAX_PER_RUN)) {
      try {
        const result = await refreshChannelTokenIfNeeded(channel);
        if (result.refreshed) refreshed++;
        else skipped++;
      } catch (err) {
        failed++;
        logger.error("cron.refresh_token_error", { channelId: channel.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    logger.info("cron.refresh_tokens", { candidates: channels.length, refreshed, skipped, failed });
    return NextResponse.json({ ok: true, candidates: channels.length, refreshed, skipped, failed });
  } catch (err) {
    logger.error("cron.refresh_tokens_error", { error: err instanceof Error ? err.message : String(err) });
    return cronError(err);
  }
}

export const GET = refreshTokens;
export const POST = refreshTokens;
