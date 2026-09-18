import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness probe for Docker HEALTHCHECK, Railway, Render and uptime monitors.
 *
 * It is public, so it says nothing beyond up or down: no timings, queue depth,
 * worker state, version or which integrations are configured. Orchestrators only
 * read the status code. Anything more detailed belongs in the logs.
 *
 * 503 only when the database is unreachable. A stalled worker must not fail this
 * check: restarting the web container would not fix it.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("health.db_unreachable", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
