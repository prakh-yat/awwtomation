import type { NextRequest } from "next/server";

import { appUrl } from "@/lib/env";

/**
 * Cross-site request forgery guard for cookie-authenticated JSON routes.
 *
 * Every mutating `app/api/*` handler is reached through `withWorkspace` /
 * `withUser`, which call `verifyRequestOrigin` before doing any work. Modern
 * browsers attach `Sec-Fetch-Site` to every request; older ones still send
 * `Origin` on non-GET fetches. A request is accepted when either says it came
 * from our own origin. Everything else (including tools that send neither
 * header) is refused, so a session cookie alone can never perform an action.
 *
 * Server Actions never pass through here: Next.js enforces its own
 * origin/host check for them. Webhooks and cron routes authenticate with
 * signatures/bearer secrets and do not use the wrappers either.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosts a same-origin request may legitimately carry in `Origin`. */
function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const configured = hostOf(appUrl());
  if (configured) hosts.add(configured);
  // Behind a proxy (Vercel, Railway, nginx) the public host is forwarded, and
  // preview deployments legitimately differ from NEXT_PUBLIC_APP_URL.
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) hosts.add(forwarded);
  const host = req.headers.get("host")?.trim().toLowerCase();
  if (host) hosts.add(host);
  return hosts;
}

export type OriginVerdict = { ok: true } | { ok: false; reason: "cross_site" | "origin_mismatch" | "no_origin" };

export function verifyRequestOrigin(req: NextRequest): OriginVerdict {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return { ok: true };

  const site = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  // "none" is a user-initiated navigation (typed URL, bookmark): not forgeable by a page.
  if (site === "same-origin" || site === "none") return { ok: true };

  const origin = hostOf(req.headers.get("origin"));
  if (origin && allowedHosts(req).has(origin)) return { ok: true };

  if (site) return { ok: false, reason: "cross_site" };
  return { ok: false, reason: origin ? "origin_mismatch" : "no_origin" };
}
