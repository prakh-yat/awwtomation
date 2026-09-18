import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { optionalEnv } from "@/lib/env";

/**
 * Cron routes accept the secret two ways:
 *  - `Authorization: Bearer ${CRON_SECRET}`, what Vercel Cron sends
 *    automatically when the env var is literally named CRON_SECRET, and what
 *    `curl -H` from Render/Railway/system cron should send.
 *  - `?token=${CRON_SECRET}`: for schedulers that cannot set headers
 *    (cron-job.org free tier, some hosting panels). Prefer the header: query
 *    strings end up in access logs.
 * Returns a 401 response to send, or null when the caller is authorized.
 */
export function authorizeCron(req: Request): NextResponse | null {
  const secret = optionalEnv("CRON_SECRET");
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token = bearer || (new URL(req.url).searchParams.get("token") ?? "").trim();
  if (!secret || !token || !constantTimeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function cronError(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message, code: "cron_failed" }, { status: 500 });
}
