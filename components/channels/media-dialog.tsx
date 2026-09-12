"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Images, MessageCircle, Play, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { ChannelSummary, MediaSummary } from "@/lib/services/channels";
import { formatNumber, truncate } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { channelDisplayName } from "./channel-status";

type MediaResponse = { media: MediaSummary[]; syncedAt: string | null };

export interface MediaDialogProps {
  channel: Pick<ChannelSummary, "id" | "platform" | "username" | "name" | "externalId">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEARCH_DEBOUNCE_MS = 250;

/** Read-only view of the cached posts the automation post picker draws from, with caption search and a manual re-sync. */
export function MediaDialog({ channel, open, onOpenChange }: MediaDialogProps) {
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MediaSummary[] | null>(null);
  const [syncedAt, setSyncedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  // Guards against an older, slower response overwriting a newer one.
  const requestId = React.useRef(0);

  const load = React.useCallback(
    async (q: string, refresh: boolean) => {
      const id = ++requestId.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (refresh) params.set("refresh", "1");
        const data = await apiFetch<MediaResponse>(`/api/channels/${channel.id}/media?${params.toString()}`);
        if (id !== requestId.current) return;
        setItems(data.media);
        setSyncedAt(data.syncedAt);
        if (refresh) toast.success(`Synced ${data.media.length} post${data.media.length === 1 ? "" : "s"}`);
      } catch (err) {
        if (id !== requestId.current) return;
        toast.error(errorMessage(err, "Couldn't load posts"));
        if (items === null) setItems([]);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [channel.id, items],
  );

  // Initial load when opened; reset when closed so a reopen shows fresh data.
  React.useEffect(() => {
    if (!open) {
      setItems(null);
      setQuery("");
      return;
    }
    void load("", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on open/close transitions
  }, [open, channel.id]);

  // Debounced caption search.
  React.useEffect(() => {
    if (!open || items === null) return;
    const handle = setTimeout(() => void load(query.trim(), false), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the query changes
  }, [query]);

  const subject = channel.platform === "INSTAGRAM" ? "posts and reels" : "Page posts";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Posts · {channelDisplayName(channel)}</DialogTitle>
          <DialogDescription>
            Cached {subject} used by the automation post picker.
            {syncedAt ? (
              <>
                {" "}
                Synced <span suppressHydrationWarning>{formatDistanceToNow(new Date(syncedAt), { addSuffix: true })}</span>.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search captions"
              className="h-8 pl-8 text-[13px]"
              aria-label="Search captions"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => void load(query.trim(), true)} loading={refreshing} disabled={loading}>
            {refreshing ? null : <RefreshCw />}
            Sync now
          </Button>
        </div>

        <ScrollArea className="h-[440px] -mx-1 px-1">
          {items === null || (loading && items.length === 0) ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Images}
              title={query ? "No posts match that search" : "No posts cached yet"}
              description={
                query
                  ? "Try a different word from the caption."
                  : `Sync now pulls the latest ${subject} from Meta. New accounts sync automatically within a minute.`
              }
              className="py-16"
            />
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-busy={loading || undefined}>
              {items.map((item) => (
                <MediaTile key={item.id} item={item} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function MediaTile({ item }: { item: MediaSummary }) {
  const src = item.thumbnailUrl ?? item.mediaUrl;
  const isVideo = item.mediaType === "VIDEO" || item.mediaType === "REELS";
  const caption = item.caption?.trim() || "No caption";
  return (
    <li className="group relative overflow-hidden rounded-md border bg-muted">
      <div className="aspect-square w-full">
        {src ? (
          // Meta CDN hostnames vary per region/asset; a plain <img> avoids next/image host allow-list failures.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Images className="h-5 w-5" strokeWidth={1.5} />
          </div>
        )}
        {isVideo ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white">
            <Play className="h-3 w-3 fill-current" />
          </span>
        ) : null}
      </div>
      <div className="space-y-1 border-t bg-background p-2">
        <p className="line-clamp-2 text-[12px] leading-snug text-foreground" title={caption}>
          {truncate(caption, 120)}
        </p>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <MessageCircle className="h-3 w-3" />
            {formatNumber(item.commentCount ?? 0)}
          </span>
          {item.permalink ? (
            <a
              href={item.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-foreground"
              aria-label="Open on Meta"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
