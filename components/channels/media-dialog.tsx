"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Images, MessageCircle, Play, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { ChannelView, MediaSummary } from "@/lib/services/channels";
import { formatNumber, truncate } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { channelDisplayName } from "./channel-status";

type MediaResponse = { media: MediaSummary[]; syncedAt: string | null };

export interface MediaDialogProps {
  channel: Pick<ChannelView, "id" | "platform" | "username" | "name">;
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
        if (refresh) toast.success(`Loaded ${data.media.length} post${data.media.length === 1 ? "" : "s"}`);
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

  const platformName = channel.platform === "INSTAGRAM" ? "Instagram" : "Facebook";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Posts</DialogTitle>
          <DialogDescription>
            {channelDisplayName(channel)}
            {syncedAt ? (
              <>
                {" · Updated "}
                <span suppressHydrationWarning>{formatDistanceToNow(new Date(syncedAt), { addSuffix: true })}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search captions"
              className="h-9 rounded-full pl-9 text-[13px]"
              aria-label="Search captions"
            />
          </div>
          <Button variant="outline" onClick={() => void load(query.trim(), true)} loading={refreshing} disabled={loading}>
            {refreshing ? null : <RefreshCw />}
            Refresh
          </Button>
        </div>

        <ScrollArea className="-mx-1 h-[min(440px,55vh)] px-1">
          {items === null || (loading && items.length === 0) ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Images}
              tone="indigo"
              compact
              title={query ? "No posts match" : "No posts yet"}
              description={query ? "Try another word from the caption." : "Refresh to load your latest posts."}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-busy={loading || undefined}>
              {items.map((item, i) => (
                <MediaTile key={item.id} item={item} index={i} platformName={platformName} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function MediaTile({ item, index, platformName }: { item: MediaSummary; index: number; platformName: string }) {
  const src = item.thumbnailUrl ?? item.mediaUrl;
  const isVideo = item.mediaType === "VIDEO" || item.mediaType === "REELS";
  const caption = item.caption?.trim() || "No caption";
  return (
    <li className="rise flex flex-col overflow-hidden rounded-xl border bg-card" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <div className="relative aspect-square w-full bg-fog">
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
          <span className="absolute right-2 top-2 rounded-full bg-ink/75 p-1 text-white" role="img" aria-label="Video">
            <Play className="h-3 w-3 fill-current" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-2 text-[12px] leading-snug text-foreground" title={caption}>
          {truncate(caption, 120)}
        </p>
        <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums" title="Comments">
            <MessageCircle className="h-3 w-3" aria-hidden />
            {formatNumber(item.commentCount ?? 0)}
          </span>
          {item.permalink ? (
            <a
              href={item.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-0.5 rounded-full font-semibold text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open on ${platformName}`}
            >
              Open
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
