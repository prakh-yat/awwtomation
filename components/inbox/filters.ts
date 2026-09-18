import type { InboxCounts } from "@/lib/services/inbox";

export type InboxFilter = "all" | "unread" | "mine" | "unassigned" | "closed";

export const INBOX_FILTERS: ReadonlyArray<{ id: InboxFilter; label: string; count?: keyof InboxCounts }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread", count: "unread" },
  { id: "mine", label: "Mine", count: "mine" },
  { id: "unassigned", label: "Unassigned" },
  { id: "closed", label: "Closed" },
];

/** Sentinel for "no channel filter": Radix Select can't represent an empty value. */
export const ALL_CHANNELS = "__all__";

// Mirrors DEFAULT_LIST_LIMIT / MAX_LIST_LIMIT in lib/services/inbox.ts (server-only module).
export const LIST_PAGE_SIZE = 30;
export const LIST_MAX_PAGE_SIZE = 100;

export function buildListQuery(opts: { filter: InboxFilter; channelId: string; q: string; cursor?: string | null; limit?: number }): string {
  const params = new URLSearchParams();
  params.set("status", opts.filter === "closed" ? "CLOSED" : "OPEN");
  if (opts.filter === "unread") params.set("unread", "1");
  if (opts.filter === "mine") params.set("assigned", "me");
  if (opts.filter === "unassigned") params.set("assigned", "unassigned");
  if (opts.channelId && opts.channelId !== ALL_CHANNELS) params.set("channelId", opts.channelId);
  if (opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit) params.set("limit", String(opts.limit));
  return `/api/inbox/conversations?${params.toString()}`;
}
