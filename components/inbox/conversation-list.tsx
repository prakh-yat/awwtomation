"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, Inbox, Plug, Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ConversationListItem, InboxChannel, InboxCounts } from "@/lib/services/inbox";
import { cn, initials } from "@/lib/utils";

import { ALL_CHANNELS, INBOX_FILTERS, type InboxFilter } from "./filters";
import { contactDisplayName, contactHandle, shortRelative } from "./format";
import { computeWindowState } from "./window-state";

function channelLabel(channel: InboxChannel): string {
  return channel.username ? `@${channel.username}` : channel.name ?? channel.platform.toLowerCase();
}

function ConversationRow({
  item,
  selected,
  now,
  onSelect,
}: {
  item: ConversationListItem;
  selected: boolean;
  now: number;
  onSelect: (id: string) => void;
}) {
  const name = contactDisplayName(item.contact);
  const handle = contactHandle(item.contact);
  const unread = item.unreadCount > 0;
  const windowClosed = computeWindowState(item.lastInboundAt, now).kind === "closed";
  const preview = item.lastMessagePreview?.trim() || (item.lastMessage?.text ?? "") || "No messages yet";
  const prefix = item.lastMessage?.direction === "OUTBOUND" ? (item.lastMessage.automated ? "Auto: " : "You: ") : "";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <span className="relative shrink-0">
          <Avatar className="h-9 w-9">
            {item.contact.avatarUrl ? <AvatarImage src={item.contact.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials(item.contact.name ?? item.contact.username)}</AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background text-foreground">
            <PlatformIcon platform={item.channel.platform} size={10} />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("truncate text-[13px]", unread ? "font-semibold" : "font-medium")}>{name}</span>
            {handle && handle !== name ? <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">{handle}</span> : null}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{shortRelative(item.lastMessageAt, now)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("truncate text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
              {prefix}
              {preview}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {windowClosed ? <Clock className="h-3 w-3 text-muted-foreground/70" aria-label="Messaging window closed" /> : null}
              {unread ? <span className="h-2 w-2 rounded-full bg-primary" aria-label={`${item.unreadCount} unread`} /> : null}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

export type ConversationListProps = {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  channels: InboxChannel[];
  channelId: string;
  onChannelChange: (channelId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  counts: InboxCounts;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  now: number;
  className?: string;
};

/** Left pane: page heading, search, filter chips, channel picker and the thread list. */
function ConversationList({
  items,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  channels,
  channelId,
  onChannelChange,
  query,
  onQueryChange,
  counts,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  now,
  className,
}: ConversationListProps) {
  const noChannels = channels.length === 0;
  const filtered = filter !== "all" || channelId !== ALL_CHANNELS || query.trim().length > 0;

  let emptyState: React.ReactNode = null;
  if (noChannels) {
    // On wider screens the conversation pane carries this call to action; phones only see the list.
    emptyState = (
      <>
        <EmptyState
          icon={Plug}
          title="Connect an account"
          description="Connect an Instagram or Facebook account and its DMs show up here."
          action={
            <Button asChild size="sm">
              <Link href="/channels">Connect an account</Link>
            </Button>
          }
          className="m-4 md:hidden"
        />
        <p className="hidden px-4 py-6 text-center text-[13px] text-muted-foreground md:block">No conversations yet.</p>
      </>
    );
  } else if (items.length === 0 && !loading) {
    emptyState = (
      <EmptyState
        icon={Inbox}
        title={filtered ? "No conversations match" : "No conversations yet"}
        description={
          filtered
            ? "Try a different filter or search term."
            : "When someone DMs a connected account or replies to an automation, the thread shows up here."
        }
        action={
          filtered ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onFilterChange("all");
                onChannelChange(ALL_CHANNELS);
                onQueryChange("");
              }}
            >
              Clear filters
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/automations">Set up an automation</Link>
            </Button>
          )
        }
        className="m-4"
      />
    );
  }

  return (
    <section className={cn("flex min-h-0 flex-col", className)} aria-label="Conversations">
      <header className="shrink-0 space-y-3 border-b px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold tracking-tight">Inbox</h1>
            <p className="sr-only">Live chat across your connected Instagram and Facebook accounts.</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {counts.open} open · {counts.unread} unread
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name, username or message"
            aria-label="Search conversations"
            className="h-8 pl-8 text-[13px]"
            disabled={noChannels}
          />
          {loading ? <Spinner size="sm" className="absolute right-2.5 top-1/2 -translate-y-1/2" /> : null}
        </div>

        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 scrollbar-none" role="tablist" aria-label="Filter conversations">
          {INBOX_FILTERS.map((f) => {
            const active = filter === f.id;
            const count = f.count ? counts[f.count] : undefined;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilterChange(f.id)}
                disabled={noChannels}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
                {count !== undefined && count > 0 ? (
                  <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {channels.length > 1 ? (
          <Select value={channelId} onValueChange={onChannelChange}>
            <SelectTrigger className="h-8 text-[13px]" aria-label="Filter by account">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CHANNELS}>All accounts</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <PlatformIcon platform={c.platform} size={12} className="text-muted-foreground" />
                    {channelLabel(c)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {emptyState ?? (
          <>
            <ul>
              {items.map((item) => (
                <ConversationRow key={item.id} item={item} selected={item.id === selectedId} now={now} onSelect={onSelect} />
              ))}
            </ul>
            {hasMore ? (
              <div className="p-3">
                <Button variant="outline" size="sm" className="w-full" onClick={onLoadMore} loading={loadingMore}>
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export { ConversationList };
