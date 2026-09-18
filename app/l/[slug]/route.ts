import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { enforceIpRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { recordClick, resolveLink } from "@/lib/services/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public + unauthenticated: cap per-IP so a scraper can't turn every redirect into a DB write. */
const LINK_LIMIT_PER_MINUTE = 120;

/**
 * Link-preview crawlers fetch every URL that lands in a DM. Counting them
 * would credit a click before the person ever tapped, so they are redirected
 * without being recorded.
 */
// Deliberately excludes "Instagram"/"WhatsApp": those tokens also appear in
// the in-app browsers real people click from.
const PREVIEW_BOT_PATTERN = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|skypeuripreview|bingpreview/i;

function clientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || undefined;
}

function redirectTo(destination: string): NextResponse {
  // 302 (not 301) so browsers keep coming back through us and every click counts.
  return NextResponse.redirect(destination, { status: 302, headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
}

type RouteContext = { params: Promise<{ slug: string }> };

/** GET /l/{slug}?c=<contactId>: public, no session. Records the click then 302s to the destination. */
export async function GET(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const limited = enforceIpRateLimit(req, "tracked_link", LINK_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (limited) return limited;

  const { slug } = await params;
  const destination = await resolveLink(slug);
  if (!destination) {
    return NextResponse.json({ error: "Link not found", code: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;
  if (!userAgent || !PREVIEW_BOT_PATTERN.test(userAgent)) {
    const contactId = req.nextUrl.searchParams.get("c")?.trim() || undefined;
    try {
      // Awaited so serverless hosts don't kill the write mid-flight, but a
      // failure to count must never stop the visitor from reaching the page.
      await recordClick(slug, { contactId, userAgent, ip: clientIp(req) });
    } catch (err) {
      logger.warn("links.record_click_failed", { slug, error: err });
    }
  }

  return redirectTo(destination);
}

/** HEAD is what most crawlers send first; resolve without counting. */
export async function HEAD(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const limited = enforceIpRateLimit(req, "tracked_link", LINK_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (limited) return limited;

  const { slug } = await params;
  const destination = await resolveLink(slug);
  if (!destination) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return redirectTo(destination);
}
