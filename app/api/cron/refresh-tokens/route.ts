import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { findChannelsNeedingRefresh, findFacebookChannelsToCheck, PAGE_CHECKS_PER_RUN, refreshChannelTokenIfNeeded } from "@/lib/meta/tokens";
import { authorizeCron, cronError } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_RUN = 50;
/** No new Meta call starts after this; one already in flight can still take its full 20 second timeout. */
const TIME_BUDGET_MS = 35_000;

/**
 * Daily: refresh Instagram tokens with < 10 days left, and check that
 * Facebook Page tokens still work. Runs inline so it works without a worker;
 * whatever the time budget doesn't reach is picked up on the next run.
 */
async function refreshTokens(req: Request): Promise<NextResponse> {
  const denied = authorizeCron(req);
  if (denied) return denied;
  const deadline = Date.now() + TIME_BUDGET_MS;
  try {
    const [channels, pages] = await Promise.all([findChannelsNeedingRefresh(), findFacebookChannelsToCheck({ max: PAGE_CHECKS_PER_RUN })]);

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;
    for (const channel of channels.slice(0, MAX_PER_RUN)) {
      if (Date.now() >= deadline) break;
      try {
        const result = await refreshChannelTokenIfNeeded(channel);
        if (result.refreshed) refreshed++;
        else skipped++;
      } catch (err) {
        failed++;
        logger.error("cron.refresh_token_error", { channelId: channel.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const checks = { candidates: pages.length, checked: 0, expired: 0, failed: 0 };
    for (const channel of pages) {
      if (Date.now() >= deadline) break;
      try {
        const result = await refreshChannelTokenIfNeeded(channel);
        checks.checked++;
        if (result.reason === "token_invalid") checks.expired++;
      } catch (err) {
        checks.failed++;
        logger.error("cron.page_token_check_error", { channelId: channel.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    logger.info("cron.refresh_tokens", { candidates: channels.length, refreshed, skipped, failed, pages: checks });
    return NextResponse.json({ ok: true, candidates: channels.length, refreshed, skipped, failed, pages: checks });
  } catch (err) {
    logger.error("cron.refresh_tokens_error", { error: err instanceof Error ? err.message : String(err) });
    return cronError(err);
  }
}

export const GET = refreshTokens;
export const POST = refreshTokens;
