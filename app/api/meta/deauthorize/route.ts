import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { handleMetaDeauthorize } from "@/lib/services/channels";

import { verifySignedRequest } from "../_shared/signed-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta "Deauthorize callback URL" (App settings → Basic). Called when a user
 * removes the app from their Instagram/Facebook settings. Always 200: Meta
 * retries on anything else and there is nothing a retry could fix.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await verifySignedRequest(req, "deauthorize");
  if (!payload) return NextResponse.json({ ok: true });

  try {
    const { channelIds } = await handleMetaDeauthorize(payload.userId);
    return NextResponse.json({ ok: true, channels: channelIds.length });
  } catch (err) {
    logger.error("meta.deauthorize_failed", { metaUserId: payload.userId, error: err });
    return NextResponse.json({ ok: true });
  }
}
