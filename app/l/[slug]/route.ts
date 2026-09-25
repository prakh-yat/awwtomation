import { after, type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { enforceIpRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { isAutomatedVisit, recordClick, resolveLink } from "@/lib/services/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public + unauthenticated: cap per-IP so a scraper can't turn every redirect into a DB write. */
const LINK_LIMIT_PER_MINUTE = 120;

/** Unlike the rate limiter's, undefined when unknown: the click then goes unhashed instead of every such visitor sharing one hash. */
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

/**
 * GET /l/{slug}?c=<contactId>: public, no session. Redirects, then counts the
 * click once the visitor is on their way. Previews, crawlers, scanners and
 * prefetches are redirected without being counted (`isAutomatedVisit`).
 */
export async function GET(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const limited = await enforceIpRateLimit(req, "tracked_link", LINK_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (limited) return limited;

  const { slug } = await params;
  const link = await resolveLink(slug);
  if (!link) {
    return NextResponse.json({ error: "Link not found", code: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (!isAutomatedVisit(req.headers)) {
    const click = {
      contactId: req.nextUrl.searchParams.get("c")?.trim() || undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      ip: clientIp(req),
    };
    // After the response, so a slow or failing write never holds up the visitor or stops them reaching the page.
    after(async () => {
      try {
        await recordClick(link, click);
      } catch (err) {
        logger.warn("links.record_click_failed", { slug, error: err });
      }
    });
  }

  return redirectTo(link.destinationUrl);
}

/** HEAD is what most crawlers send first; resolve without counting. */
export async function HEAD(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const limited = await enforceIpRateLimit(req, "tracked_link", LINK_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (limited) return limited;

  const { slug } = await params;
  const link = await resolveLink(slug);
  if (!link) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return redirectTo(link.destinationUrl);
}
