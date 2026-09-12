import { NextResponse } from "next/server";

import { createLinkSchema, createTrackedLink, linkListQuerySchema, listTrackedLinks } from "@/lib/services/links";
import { parseBody, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/links?automationId=&broadcastId=&q= → { items: TrackedLinkListItem[] } (newest first, max 500). */
export const GET = withWorkspace(async (req, ctx) => {
  const query = parseQuery(req, linkListQuerySchema);
  const items = await listTrackedLinks(ctx.workspace.id, query);
  return NextResponse.json({ items });
});

/**
 * POST /api/links { destinationUrl, label?, automationId?, broadcastId?, slug? }
 * → 201 { link: TrackedLinkListItem }. 409 SLUG_TAKEN when a custom slug collides.
 */
export const POST = withWorkspace(async (req, ctx) => {
  const body = await parseBody(req, createLinkSchema);
  const link = await createTrackedLink(ctx.workspace.id, body);
  return NextResponse.json({ link }, { status: 201 });
});
