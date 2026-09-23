"use client";

import * as React from "react";
import { Check, ImageOff, RefreshCw, Search } from "lucide-react";

import { errorMessage } from "@/components/automations/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { MediaSummary } from "@/lib/services/automations";
import { cn } from "@/lib/utils";

import { fetchChannelMedia } from "./media-api";

export type MediaPickerProps = {
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Lets the builder cache thumbnails for the selected-posts strip. */
  onLoaded: (items: MediaSummary[]) => void;
};

export function MediaThumb({ item, className }: { item: MediaSummary | undefined; className?: string }) {
  const src = item?.thumbnailUrl ?? item?.mediaUrl ?? null;
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-fog text-mute", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- CDN host varies per platform/post
        <img src={src} alt={item?.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-4 w-4" strokeWidth={1.5} />
      )}
    </div>
  );
}

export function MediaPicker({ channelId, open, onOpenChange, selected, onChange, onLoaded }: MediaPickerProps) {
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MediaSummary[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>(selected);

  React.useEffect(() => {
    if (open) setDraft(selected);
  }, [open, selected]);

  const load = React.useCallback(
    async (opts: { q?: string; refresh?: boolean }) => {
      if (opts.refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const result = await fetchChannelMedia(channelId, opts);
        setItems(result.items);
        onLoaded(result.items);
        if (opts.refresh) {
          toast.success(result.refreshQueued ? "Fetching your latest posts" : "Posts are up to date");
        }
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't load posts"));
        setItems((prev) => prev ?? []);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [channelId, onLoaded],
  );

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load({ q: query.trim() || undefined }), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, query, load]);

  function toggle(id: string) {
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose posts</DialogTitle>
          <DialogDescription>It only runs on comments under these posts.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search captions" className="pl-9" aria-label="Search posts" />
          </div>
          <Button variant="outline" size="sm" onClick={() => load({ q: query.trim() || undefined, refresh: true })} loading={refreshing}>
            <RefreshCw /> Refresh
          </Button>
        </div>

        <div className="max-h-[420px] min-h-[200px] overflow-y-auto scrollbar-thin">
          {items === null || loading ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              compact
              tone="purple"
              icon={ImageOff}
              title={query ? "No posts match" : "No posts yet"}
              description={query ? "Try another word from the caption." : "Refresh to load this account's posts."}
            />
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {items.map((item) => {
                const on = draft.includes(item.externalId);
                return (
                  <button
                    key={item.externalId}
                    type="button"
                    onClick={() => toggle(item.externalId)}
                    aria-pressed={on}
                    title={item.caption ?? undefined}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border-2 transition-[box-shadow,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "scale-[0.97] border-purple ring-4 ring-purple/15" : "border-transparent hover:border-ink/30",
                    )}
                  >
                    <MediaThumb item={item} className="h-full w-full" />
                    {on ? (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 animate-pop items-center justify-center rounded-full bg-purple text-white shadow-card">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    ) : null}
                    {item.caption ? (
                      <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-ink/75 px-1.5 py-1 text-left text-[10px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {item.caption}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[12px] text-muted-foreground">
            {draft.length} selected
            {draft.length > 0 ? (
              <>
                {" · "}
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setDraft([])}>
                  Clear
                </button>
              </>
            ) : null}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onChange(draft);
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
