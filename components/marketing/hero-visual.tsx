import * as React from "react";
import { ChevronLeft, ExternalLink, Heart } from "lucide-react";

import { cn } from "@/lib/utils";

import { Avatar, Panel } from "./mock-parts";

function Comment({
  initials,
  ink,
  user,
  time,
  size = 28,
  interactive = true,
  children,
}: {
  initials: string;
  ink?: boolean;
  user: string;
  time: string;
  size?: number;
  /** Show the "Reply" link and the like heart (not on the post caption). */
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Avatar initials={initials} ink={ink} size={size} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-4">
          <span className="font-semibold text-foreground">{user}</span>
          <span className="ml-1.5 text-muted-foreground">{time}</span>
        </p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-foreground">{children}</p>
        {interactive ? <p className="mt-1 text-[11px] font-medium text-muted-foreground">Reply</p> : null}
      </div>
      {interactive ? <Heart aria-hidden className="mt-1.5 size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} /> : null}
    </div>
  );
}

/** The comments sheet under the autumn collection reel, as a follower sees it. */
function CommentsPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("rounded-2xl", className)}>
      <div className="border-b px-4 py-3 text-center">
        <p className="text-[13px] font-semibold">Comments</p>
      </div>
      <div className="space-y-4 px-4 pb-5 pt-4">
        <Comment initials="HT" ink user="himalayanthreads" time="2h" interactive={false}>
          The autumn collection is here. Comment “link” and we’ll send it to your DMs.
        </Comment>
        <div className="h-px bg-border" />
        <Comment initials="SR" user="sita.rai" time="3m">
          link
        </Comment>
        <div className="pl-[38px]">
          <Comment initials="HT" ink size={22} user="himalayanthreads" time="3m">
            Sent it to your DMs, Sita.
          </Comment>
        </div>
        <Comment initials="AG" user="anisha.gurung" time="6m">
          Link please
        </Comment>
        <div className="hidden sm:block">
          <Comment initials="PS" user="prabin.shrestha" time="9m">
            Is the green one there in L?
          </Comment>
        </div>
      </div>
    </Panel>
  );
}

/** Sita's Instagram DMs a few seconds after she commented. */
function DirectMessagePanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("flex flex-col rounded-2xl", className)}>
      <div className="flex items-center gap-2.5 border-b px-3.5 py-3">
        <ChevronLeft aria-hidden className="size-4 text-foreground/60" strokeWidth={2} />
        <Avatar initials="HT" ink size={28} />
        <div className="min-w-0 leading-tight">
          <p className="text-[13px] font-semibold">himalayanthreads</p>
          <p className="text-[11px] text-muted-foreground">Himalayan Threads</p>
        </div>
      </div>
      <div className="space-y-3 px-3.5 pb-4 pt-3">
        <p className="text-center text-[11px] text-muted-foreground">Today 4:12 PM</p>
        <div className="flex items-end gap-2">
          <Avatar initials="HT" ink size={22} />
          <div className="min-w-0 max-w-[86%]">
            <p className="mb-1 px-1 text-[11px] text-muted-foreground">Replied to your comment</p>
            <div className="overflow-hidden rounded-[18px] rounded-bl-md border bg-background">
              <p className="px-3.5 py-2.5 text-[13px] leading-[1.45]">
                Namaste Sita! Here’s the autumn collection. Delivery is free inside the valley this month.
              </p>
              <p className="flex items-center justify-center gap-1.5 border-t px-3 py-2 text-[13px] font-medium">
                Shop the collection
                <ExternalLink aria-hidden className="size-3" strokeWidth={2.25} />
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 pt-1">
          <p className="max-w-[80%] rounded-[18px] rounded-br-md bg-foreground px-3.5 py-2 text-[13px] leading-[1.45] text-background">
            Do you have the rust kurta in M?
          </p>
          <p className="px-1 text-[11px] text-muted-foreground">Seen</p>
        </div>
      </div>
      <div className="mt-auto border-t px-3.5 py-3">
        <p className="rounded-full border px-3.5 py-1.5 text-[12px] text-muted-foreground">Message…</p>
      </div>
    </Panel>
  );
}

/**
 * Hero picture: a keyword comment on the left, the private reply it produced
 * on the right. Built from divs so it stays sharp and matches the product.
 */
function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Sita Rai comments “link” under a Himalayan Threads reel and gets a direct message with a Shop the collection button."
      className={cn("grid items-end gap-4 sm:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] sm:gap-5", className)}
    >
      <CommentsPanel />
      <DirectMessagePanel />
    </div>
  );
}

export { HeroVisual, DirectMessagePanel };
