import { NextResponse } from "next/server";

import { isMetaConfigured, optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getHealth, type PlatformHealth } from "@/lib/services/admin";
import pkg from "@/package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness/readiness probe for Docker HEALTHCHECK, Railway,
 * Render, Vercel checks and uptime monitors.
 *
 * Exposes booleans only — never a secret or a URL — because it is public by
 * design. Returns 503 solely when the database is unreachable: a stale worker
 * is reported in the body but must not make an orchestrator restart the web
 * container, which would not fix the worker anyway.
 */
type HealthResponse = {
  ok: boolean;
  status: PlatformHealth["status"];
  version: string;
  commit: string | null;
  checkedAt: string;
  db: { ok: boolean; latencyMs: number | null };
  worker: { status: PlatformHealth["worker"]["status"]; lastHeartbeat: string | null; dueJobs: number };
  billingConfigured: boolean;
  metaConfigured: { instagram: boolean; facebook: boolean };
  cronConfigured: boolean;
};

/** Hosts inject their own commit variable; GIT_COMMIT_SHA is the manual override for Docker builds. */
function commitSha(): string | null {
  const sha =
    process.env.GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.RENDER_GIT_COMMIT ??
    null;
  return sha ? sha.slice(0, 12) : null;
}

function billingConfigured(): boolean {
  return Boolean(optionalEnv("DODO_SECRET_KEY") && optionalEnv("DODO_WEBHOOK_SECRET"));
}

function respond(body: HealthResponse): NextResponse {
  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(): Promise<NextResponse> {
  const base = {
    version: pkg.version,
    commit: commitSha(),
    billingConfigured: billingConfigured(),
    metaConfigured: isMetaConfigured(),
    cronConfigured: Boolean(optionalEnv("CRON_SECRET")),
  };

  try {
    const health = await getHealth();
    return respond({
      ok: health.db.ok,
      status: health.status,
      checkedAt: health.checkedAt,
      db: { ok: health.db.ok, latencyMs: health.db.latencyMs },
      worker: {
        status: health.worker.status,
        lastHeartbeat: health.worker.lastSeenAt,
        dueJobs: health.worker.dueJobs,
      },
      ...base,
    });
  } catch (err) {
    // getHealth() already tolerates a dead database; anything reaching here is
    // a misconfiguration (e.g. DATABASE_URL unset) — still answer with JSON.
    logger.error("health.failed", { error: err instanceof Error ? err.message : String(err) });
    return respond({
      ok: false,
      status: "down",
      checkedAt: new Date().toISOString(),
      db: { ok: false, latencyMs: null },
      worker: { status: "unknown", lastHeartbeat: null, dueJobs: 0 },
      ...base,
    });
  }
}
