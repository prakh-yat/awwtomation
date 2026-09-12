import type { MediaSummary } from "@/lib/services/automations";

import { apiFetch, ApiClientError } from "../api";

type Loose = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts `{ items }`, `{ media }`, `{ data }` or a bare array, in either camelCase or Graph snake_case. */
function normalize(body: unknown): MediaSummary[] {
  const list = Array.isArray(body)
    ? body
    : isRecord(body)
      ? ((body.items ?? body.media ?? body.data) as unknown)
      : null;
  if (!Array.isArray(list)) return [];
  const out: MediaSummary[] = [];
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    const externalId = str(raw.externalId) ?? str(raw.id);
    if (!externalId) continue;
    out.push({
      externalId,
      caption: str(raw.caption),
      mediaType: str(raw.mediaType) ?? str(raw.media_type),
      thumbnailUrl: str(raw.thumbnailUrl) ?? str(raw.thumbnail_url) ?? str(raw.mediaUrl) ?? str(raw.media_url),
      mediaUrl: str(raw.mediaUrl) ?? str(raw.media_url),
      permalink: str(raw.permalink) ?? str(raw.permalinkUrl),
      timestamp: str(raw.timestamp) ?? str(raw.createdTime),
      commentCount: num(raw.commentCount) ?? num(raw.commentsCount) ?? num(raw.comments_count),
    });
  }
  return out;
}

/**
 * Loads posts for the picker. The channels lane's endpoint is authoritative;
 * until it exists (404) we read the same Media cache through this lane's
 * `/api/automations/media` helper so the builder works in isolation.
 */
export async function fetchChannelMedia(channelId: string, opts: { q?: string; refresh?: boolean } = {}): Promise<{ items: MediaSummary[]; refreshQueued: boolean }> {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.refresh) params.set("refresh", "1");
  const qs = params.toString();

  try {
    const body = await apiFetch<unknown>(`/api/channels/${encodeURIComponent(channelId)}/media${qs ? `?${qs}` : ""}`);
    const refreshQueued = isRecord(body) && typeof body.refreshQueued === "boolean" ? body.refreshQueued : Boolean(opts.refresh);
    return { items: normalize(body), refreshQueued };
  } catch (err) {
    if (!(err instanceof ApiClientError) || err.status !== 404) throw err;
  }

  params.set("channelId", channelId);
  const fallback = await apiFetch<{ items: MediaSummary[]; refreshQueued: boolean }>(`/api/automations/media?${params.toString()}`);
  return { items: normalize(fallback), refreshQueued: fallback.refreshQueued };
}
