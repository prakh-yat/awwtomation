import { NextResponse } from "next/server";

import { deleteTrackedLink, getLinkStats, linkStatsQuerySchema, updateLinkSchema, updateTrackedLink } from "@/lib/services/links";
import { parseBody, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** GET /api/links/[id]?days=30 → TrackedLinkStats ({ link, days, timezone, series, clicksInRange, recentClicks }). */
export const GET = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { days } = parseQuery(req, linkStatsQuerySchema);
  const stats = await getLinkStats(ctx.workspace.id, id, days, ctx.workspace.timezone);
  return NextResponse.json(stats);
});

/** PATCH /api/links/[id] { label?: string | null, destinationUrl?: string } → { link: TrackedLinkListItem }. */
export const PATCH = withWorkspace<Params>(async (req, ctx, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, updateLinkSchema);
  const link = await updateTrackedLink(ctx.workspace.id, id, body);
  return NextResponse.json({ link });
});

/** DELETE /api/links/[id] → { ok: true }. Cascades the link's clicks. */
export const DELETE = withWorkspace<Params>(async (_req, ctx, { params }) => {
  const { id } = await params;
  await deleteTrackedLink(ctx.workspace.id, id);
  return NextResponse.json({ ok: true });
});
