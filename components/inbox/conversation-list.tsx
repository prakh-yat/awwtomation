"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, Inbox, Plug, Search, SearchX, Workflow, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterMenu } from "@/components/ui/filter-menu";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PLATFORM_TONE, PlatformMark } from "@/components/ui/platform-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ConversationListItem, InboxChannel, InboxCounts } from "@/lib/services/inbox";
import { cn, initials } from "@/lib/utils";

import { ALL_CHANNELS, INBOX_FILTERS, type InboxFilter } from "./filters";
import { contactDisplayName, previewText, shortRelative } from "./format";
import { computeWindowState } from "./window-state";

/** Rows past this rise in together, so a long list settles quickly. */
const RISE_CAP = 12;

function channelLabel(channel: InboxChannel): string {
  return channel.username ? `@${channel.username}` : (channel.name ?? PLATFORM_TONE[channel.platform].label);
}

function ConversationRow({
  item,
  index,
  selected,
  focusable,
  now,
  onSelect,
}: {
  item: ConversationListItem;
  index: number;
  selected: boolean;
  /** Roving tab stop: one row is reachable with Tab, arrow keys move between the rest. */
  focusable: boolean;
  now: number;
  onSelect: (id: string) => void;
}) {
  const name = contactDisplayName(item.contact);
  const unread = item.unreadCount > 0;
  const windowClosed = computeWindowState(item.lastInboundAt, now).kind === "closed";
  const raw = item.lastMessagePreview?.trim() || item.lastMessage?.text?.trim() || "";
  const outbound = item.lastMessage?.direction === "OUTBOUND";
  const automated = outbound && item.lastMessage?.automated === true;

  return (
    <li className="rise" style={{ "--i": Math.min(index, RISE_CAP) } as React.CSSProperties}>
      <button
        type="button"
        data-conversation-row=""
        tabIndex={focusable ? 0 : -1}
        onClick={() => onSelect(item.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected ? "bg-magenta-soft" : "hover:bg-fog",
        )}
      >
        <span className="relative shrink-0">
          <Avatar className="h-10 w-10" aria-hidden>
            {item.contact.avatarUrl ? <AvatarImage src={item.contact.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-[12px]">{initials(item.contact.name ?? item.contact.username)}</AvatarFallback>
          </Avatar>
          <PlatformMark
            platform={item.channel.platform}
            size={16}
            className={cn(
              "absolute -bottom-0.5 -right-0.5 ring-2 transition-[box-shadow] duration-150",
              selected ? "ring-magenta-soft" : "ring-background group-hover:ring-fog",
            )}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("truncate text-[14px] leading-5 text-ink", unread ? "font-bold" : "font-medium")}>{name}</span>
            <span
              className={cn(
                "ml-auto shrink-0 text-[11px] tabular-nums",
                unread ? "font-semibold text-magenta-ink" : "text-muted-foreground",
              )}
            >
              {shortRelative(item.lastMessageAt, now)}
            </span>
          </span>

          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1 text-[13px] leading-5",
                unread ? "font-medium text-ink" : "text-muted-foreground",
              )}
            >
              {automated ? <Workflow className="h-3 w-3 shrink-0 text-purple-ink" aria-hidden /> : null}
              <span className="truncate">
                {automated ? <span className="sr-only">Automated: </span> : outbound ? "You: " : null}
                {raw ? previewText(raw) : "No messages yet"}
              </span>
            </span>
            {windowClosed ? (
              <span className="shrink-0 text-muted-foreground/70">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Replies closed</span>
              </span>
            ) : null}
            {unread ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-magenta px-1.5 text-[11px] font-bold tabular-nums text-white">
                <span className="sr-only">Unread messages: </span>
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
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

/**
 * Left pane: the page title, search, filters, the account picker and the
 * conversation list. On md and up the pane keeps clear of the dock's resting
 * strip at the left edge of the window.
 */
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
  const tabStopId = items.some((c) => c.id === selectedId) ? selectedId : (items[0]?.id ?? null);
  const listRef = React.useRef<HTMLUListElement>(null);

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-conversation-row]"));
    if (rows.length === 0) return;
    event.preventDefault();
    const current = rows.findIndex((row) => row === document.activeElement);
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else if (current === -1) next = 0;
    else next = Math.min(rows.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
    rows[next].focus();
  }

  function clearFilters() {
    onFilterChange("all");
    onChannelChange(ALL_CHANNELS);
    onQueryChange("");
  }

  let body: React.ReactNode;
  if (noChannels) {
    // On wider screens the conversation pane carries this call to action; phones only see the list.
    body = (
      <>
        <EmptyState
          compact
          tone="magenta"
          icon={Plug}
          title="No accounts connected"
          action={
            <Button asChild size="sm" variant="highlight">
              <Link href="/dashboard?accounts=1">Connect account</Link>
            </Button>
          }
          className="m-3 md:hidden"
        />
        <p className="hidden px-5 py-4 text-[13px] text-muted-foreground md:block md:pl-10">No conversations yet.</p>
      </>
    );
  } else if (items.length === 0 && loading) {
    body = (
      <div className="px-2 md:pl-7" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = filtered ? (
      <EmptyState
        compact
        tone="magenta"
        icon={SearchX}
        title="No conversations match"
        action={
          <Button size="sm" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        }
        className="m-3 md:ml-7"
      />
    ) : (
      <EmptyState
        compact
        tone="magenta"
        icon={Inbox}
        title="No conversations yet"
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/automations">Set up an automation</Link>
          </Button>
        }
        className="m-3 md:ml-7"
      />
    );
  } else {
    body = (
      <>
        <ul
          ref={listRef}
          onKeyDown={onListKeyDown}
          aria-busy={loading || undefined}
          className={cn("space-y-0.5 px-2 pb-2 transition-opacity duration-150 md:pl-7", loading && "opacity-60")}
        >
          {items.map((item, i) => (
            <ConversationRow
              key={item.id}
              item={item}
              index={i}
              selected={item.id === selectedId}
              focusable={item.id === tabStopId}
              now={now}
              onSelect={onSelect}
            />
          ))}
        </ul>
        {hasMore ? (
          <div className="px-2 pb-4 pt-1 md:pl-7">
            <Button variant="secondary" size="sm" className="w-full" onClick={onLoadMore} loading={loadingMore}>
              Load more
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  const multiAccount = channels.length > 1;
  // Beside the account picker when there is one, beside the search when there is not.
  const filterMenu = (
    <FilterMenu
      label="Show"
      value={filter}
      onChange={onFilterChange}
      defaultValue="all"
      disabled={noChannels}
      options={INBOX_FILTERS.map((f) => ({ value: f.id, label: f.label, count: f.count ? counts[f.count] : null }))}
    />
  );

  return (
    <section className={cn("flex min-h-0 flex-col bg-background", className)} aria-label="Conversations">
      <div className="shrink-0 space-y-3 px-5 pb-3 pt-5 md:pl-10 md:pr-4">
        <PageHeader title="Inbox" className="mb-1" />

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  onQueryChange("");
                } else if (e.key === "ArrowDown") {
                  // Straight from the search box into the results.
                  const firstRow = listRef.current?.querySelector<HTMLButtonElement>("[data-conversation-row]");
                  if (firstRow) {
                    e.preventDefault();
                    firstRow.focus();
                  }
                }
              }}
              placeholder="Search names and messages"
              aria-label="Search conversations"
              className="pl-10 pr-10 text-[13px]"
              disabled={noChannels}
            />
            {loading ? (
              // Positioned by a wrapper: the spin animation would override a transform on the icon itself.
              <span className="absolute right-3.5 top-1/2 flex -translate-y-1/2">
                <Spinner size="sm" />
              </span>
            ) : query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fog hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {multiAccount ? null : filterMenu}
        </div>

        {multiAccount ? (
          <div className="flex items-center gap-2">
            <Select value={channelId} onValueChange={onChannelChange}>
              <SelectTrigger className="h-9 min-w-0 flex-1 text-[13px]" aria-label="Filter by account">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CHANNELS}>All accounts</SelectItem>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <PlatformMark platform={c.platform} size={16} />
                      {channelLabel(c)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterMenu}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{body}</div>
    </section>
  );
}

export { ConversationList };
