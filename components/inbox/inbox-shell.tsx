"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { OutboundMessage } from "@/lib/meta/types";
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationPage,
  InboxChannel,
  InboxCounts,
  InboxMessage,
  InboxUser,
  MessagePage,
  SyncResult,
} from "@/lib/services/inbox";
import { cn } from "@/lib/utils";

import { apiFetch, errorMessage, InboxApiError, isAbort } from "./api";
import { ContactPanel } from "./contact-panel";
import { ConversationList } from "./conversation-list";
import { ALL_CHANNELS, buildListQuery, LIST_MAX_PAGE_SIZE, LIST_PAGE_SIZE, type InboxFilter } from "./filters";
import { userDisplayName } from "./format";
import { InboxFrame } from "./inbox-frame";
import { Thread, type ThreadBusy } from "./thread";
import { useNow, useVisiblePolling } from "./use-polling";

const POLL_INTERVAL_MS = 8_000;
const SEARCH_DEBOUNCE_MS = 300;

type MembersResponse = { members: Array<{ user: InboxUser }> };

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function byCreatedAt(a: InboxMessage, b: InboxMessage): number {
  return a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1;
}

/** Union by id, newest last. Incoming rows win so edits (e.g. a mid filled in later) show up. */
function mergeMessages(existing: InboxMessage[], incoming: InboxMessage[]): InboxMessage[] {
  const map = new Map<string, InboxMessage>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(byCreatedAt);
}

/** Fresh detail is authoritative for everything except the pages of older messages already loaded. */
function mergeDetail(prev: ConversationDetail | null, fresh: ConversationDetail): ConversationDetail {
  if (!prev || prev.id !== fresh.id) return fresh;
  return {
    ...fresh,
    messages: mergeMessages(prev.messages, fresh.messages),
    hasMoreMessages: prev.hasMoreMessages && fresh.hasMoreMessages,
  };
}

function toListItem(detail: ConversationDetail): ConversationListItem {
  const { messages, hasMoreMessages: _hasMore, recentSessions: _sessions, ...rest } = detail;
  const last = messages[messages.length - 1];
  return {
    ...rest,
    lastMessage: last ? { id: last.id, direction: last.direction, text: last.text, createdAt: last.createdAt, automated: last.automated } : rest.lastMessage,
  };
}

function setUrlConversation(id: string | null) {
  // Shallow update: `router.replace` would re-render the server page and flash
  // loading.tsx over the whole inbox on every click. Next keeps
  // `useSearchParams` in sync with the native History API.
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(null, "", url.toString());
}

function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex-1 space-y-3 px-6 py-5">
        <div className="flex justify-start">
          <Skeleton className="h-10 w-56 rounded-2xl" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-64 rounded-2xl" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-10 w-40 rounded-2xl" />
        </div>
      </div>
      <div className="border-t p-3">
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}

export type InboxShellProps = {
  workspaceId: string;
  channels: InboxChannel[];
  initialPage: ConversationPage;
  initialCounts: InboxCounts;
  initialDetail: ConversationDetail | null;
};

/**
 * Client orchestrator for the three panes. Server-rendered initial data is
 * used for first paint only; everything after that comes from /api/inbox/*
 * with an 8s poll while the tab is visible.
 */
function InboxShell({ workspaceId, channels, initialPage, initialCounts, initialDetail }: InboxShellProps) {
  const now = useNow();

  const [filter, setFilter] = React.useState<InboxFilter>("all");
  const [channelId, setChannelId] = React.useState(ALL_CHANNELS);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebounced(query, SEARCH_DEBOUNCE_MS);

  const [items, setItems] = React.useState(initialPage.items);
  const [nextCursor, setNextCursor] = React.useState(initialPage.nextCursor);
  const [listLoading, setListLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [counts, setCounts] = React.useState(initialCounts);

  const [selectedId, setSelectedId] = React.useState<string | null>(initialDetail?.id ?? null);
  const [detail, setDetail] = React.useState<ConversationDetail | null>(initialDetail);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<InboxUser[] | null>(null);
  const [busy, setBusy] = React.useState<ThreadBusy>({ assign: false, status: false, sync: false, older: false, send: false });

  // Refs let async callbacks check "is this response still relevant?" without stale closures.
  const selectedRef = React.useRef(selectedId);
  const itemCountRef = React.useRef(items.length);
  const listAbortRef = React.useRef<AbortController | null>(null);
  const lastListKeyRef = React.useRef(`${filter}|${channelId}|${debouncedQuery}`);
  const autoSyncedRef = React.useRef<Set<string>>(new Set());
  // Sequence numbers: only the newest request may write state, so a slow poll
  // can't overwrite the result of a later user action (or a later poll).
  const listSeqRef = React.useRef(0);
  const listLoadingSeqRef = React.useRef<number | null>(null);
  const detailSeqRef = React.useRef(0);

  React.useEffect(() => {
    itemCountRef.current = items.length;
  }, [items.length]);

  function setBusyFlag(key: keyof ThreadBusy, value: boolean) {
    setBusy((prev) => ({ ...prev, [key]: value }));
  }

  // ───────────── Fetchers ─────────────

  const fetchCounts = React.useCallback(async () => {
    try {
      setCounts(await apiFetch<InboxCounts>("/api/inbox/counts"));
    } catch {
      // Counts are decorative; the next poll will retry.
    }
  }, []);

  const fetchList = React.useCallback(
    async (opts: { silent?: boolean } = {}) => {
      // A background poll must never cancel a fetch the user is waiting on.
      if (opts.silent && listLoadingSeqRef.current !== null) return;
      const seq = ++listSeqRef.current;
      listAbortRef.current?.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;
      if (!opts.silent) {
        listLoadingSeqRef.current = seq;
        setListLoading(true);
      }
      try {
        // Refresh at least as many rows as are on screen so "Load more" pages aren't lost on poll.
        const limit = Math.min(LIST_MAX_PAGE_SIZE, Math.max(LIST_PAGE_SIZE, itemCountRef.current));
        const page = await apiFetch<ConversationPage>(buildListQuery({ filter, channelId, q: debouncedQuery, limit }), { signal: controller.signal });
        if (seq !== listSeqRef.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      } catch (err) {
        if (isAbort(err) || seq !== listSeqRef.current) return;
        if (!opts.silent) toast.error(errorMessage(err, "Couldn't load conversations"));
      } finally {
        // Only the request that turned the spinner on (or a newer one) may turn it off.
        if (listLoadingSeqRef.current !== null && seq >= listLoadingSeqRef.current) {
          listLoadingSeqRef.current = null;
          setListLoading(false);
        }
      }
    },
    [filter, channelId, debouncedQuery],
  );

  const markRead = React.useCallback(
    async (id: string) => {
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      setDetail((prev) => (prev && prev.id === id ? { ...prev, unreadCount: 0 } : prev));
      try {
        await apiFetch(`/api/inbox/conversations/${encodeURIComponent(id)}/read`, { method: "POST" });
        void fetchCounts();
      } catch {
        // Non-critical; the unread dot will come back on the next poll if it truly failed.
      }
    },
    [fetchCounts],
  );

  const fetchDetail = React.useCallback(
    async (id: string, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) {
        setDetailLoading(true);
        setDetailError(null);
      }
      const seq = ++detailSeqRef.current;
      try {
        const { conversation } = await apiFetch<{ conversation: ConversationDetail }>(`/api/inbox/conversations/${encodeURIComponent(id)}`);
        if (selectedRef.current !== id || seq !== detailSeqRef.current) return;
        setDetail((prev) => mergeDetail(prev, conversation));
        // New inbound messages while the thread is on screen count as read.
        if (conversation.unreadCount > 0 && document.visibilityState === "visible") void markRead(id);
      } catch (err) {
        if (selectedRef.current !== id) return;
        if (!opts.silent) setDetailError(errorMessage(err, "Couldn't load this conversation"));
      } finally {
        if (selectedRef.current === id && !opts.silent) setDetailLoading(false);
      }
    },
    [markRead],
  );

  const sync = React.useCallback(
    async (id: string, opts: { silent?: boolean } = {}) => {
      setBusyFlag("sync", true);
      try {
        const res = await apiFetch<SyncResult & { conversation: ConversationDetail }>(`/api/inbox/conversations/${encodeURIComponent(id)}/sync`, {
          method: "POST",
        });
        if (selectedRef.current === id) {
          detailSeqRef.current++;
          setDetail((prev) => mergeDetail(prev, res.conversation));
        }
        if (!opts.silent) {
          if (!res.found) toast.info("Meta has no conversation with this contact yet");
          else if (res.imported > 0) toast.success(`Imported ${res.imported} new message${res.imported === 1 ? "" : "s"}`);
          else toast.success("Already up to date");
        }
        void fetchList({ silent: true });
      } catch (err) {
        if (!opts.silent) toast.error(errorMessage(err, "Couldn't refresh from Meta"));
      } finally {
        setBusyFlag("sync", false);
      }
    },
    [fetchList],
  );

  // ───────────── Effects ─────────────

  // Refetch when filters change. Keyed rather than "skip first run" so React's
  // dev double-invoke doesn't trigger a redundant fetch on mount.
  React.useEffect(() => {
    const key = `${filter}|${channelId}|${debouncedQuery}`;
    if (key === lastListKeyRef.current) return;
    lastListKeyRef.current = key;
    void fetchList();
  }, [filter, channelId, debouncedQuery, fetchList]);

  React.useEffect(() => {
    let cancelled = false;
    apiFetch<MembersResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`)
      .then((res) => {
        if (!cancelled) setMembers(res.members.map((m) => m.user));
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // A thread with no stored messages (webhook subscribed late, or history predates the
  // connection) gets one silent backfill from Meta the first time it's opened.
  const detailId = detail?.id ?? null;
  const detailIsEmpty = detail !== null && detail.messages.length === 0;
  const detailChannelActive = detail?.channel.status === "ACTIVE";
  React.useEffect(() => {
    if (!detailId || !detailIsEmpty || !detailChannelActive || autoSyncedRef.current.has(detailId)) return;
    autoSyncedRef.current.add(detailId);
    void sync(detailId, { silent: true });
  }, [detailId, detailIsEmpty, detailChannelActive, sync]);

  useVisiblePolling(() => {
    void fetchList({ silent: true });
    void fetchCounts();
    if (selectedRef.current) void fetchDetail(selectedRef.current, { silent: true });
  }, POLL_INTERVAL_MS);

  // ───────────── Handlers ─────────────

  function select(id: string) {
    if (id === selectedRef.current) return;
    selectedRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setUrlConversation(id);
    const known = items.find((c) => c.id === id);
    if (known && known.unreadCount > 0) void markRead(id);
    void fetchDetail(id);
  }

  function back() {
    selectedRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setUrlConversation(null);
  }

  function applyDetail(fresh: ConversationDetail) {
    // Invalidate any poll that started before this action so it can't roll the header back.
    detailSeqRef.current++;
    setDetail((prev) => mergeDetail(prev, fresh));
    const summary = toListItem(fresh);
    setItems((prev) => {
      const idx = prev.findIndex((c) => c.id === fresh.id);
      if (idx === -1) return prev;
      // Closing hides the row from every filter except "Closed" (and vice versa) — drop it rather than show a stale row.
      const visible = filter === "closed" ? fresh.status === "CLOSED" : fresh.status === "OPEN";
      if (!visible) return prev.filter((c) => c.id !== fresh.id);
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...summary };
      return next;
    });
  }

  async function assign(userId: string | null) {
    if (!detail) return;
    const id = detail.id;
    setBusyFlag("assign", true);
    try {
      const res = await apiFetch<{ conversation: ConversationDetail }>(`/api/inbox/conversations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: { assignedToId: userId },
      });
      applyDetail(res.conversation);
      toast.success(res.conversation.assignedTo ? `Assigned to ${userDisplayName(res.conversation.assignedTo)}` : "Unassigned");
      void fetchCounts();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update assignment"));
    } finally {
      setBusyFlag("assign", false);
    }
  }

  async function toggleStatus() {
    if (!detail) return;
    const id = detail.id;
    const status = detail.status === "OPEN" ? "CLOSED" : "OPEN";
    setBusyFlag("status", true);
    try {
      const res = await apiFetch<{ conversation: ConversationDetail }>(`/api/inbox/conversations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: { status },
      });
      applyDetail(res.conversation);
      toast.success(status === "CLOSED" ? "Conversation closed" : "Conversation reopened");
      void fetchCounts();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the conversation"));
    } finally {
      setBusyFlag("status", false);
    }
  }

  async function loadOlder() {
    if (!detail || detail.messages.length === 0) return;
    const id = detail.id;
    const before = detail.messages[0].id;
    setBusyFlag("older", true);
    try {
      const page = await apiFetch<MessagePage>(`/api/inbox/conversations/${encodeURIComponent(id)}/messages?before=${encodeURIComponent(before)}`);
      if (selectedRef.current !== id) return;
      setDetail((prev) => (prev && prev.id === id ? { ...prev, messages: mergeMessages(page.messages, prev.messages), hasMoreMessages: page.hasMore } : prev));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load earlier messages"));
    } finally {
      setBusyFlag("older", false);
    }
  }

  async function send(message: OutboundMessage, humanAgent: boolean): Promise<boolean> {
    if (!detail) return false;
    const id = detail.id;
    setBusyFlag("send", true);
    try {
      const res = await apiFetch<{ message: InboxMessage }>(`/api/inbox/conversations/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        json: { message, humanAgent },
      });
      const sent = res.message;
      detailSeqRef.current++;
      setDetail((prev) =>
        prev && prev.id === id
          ? { ...prev, status: "OPEN", messages: mergeMessages(prev.messages, [sent]), lastMessageAt: sent.createdAt, lastMessagePreview: sent.text ?? "[buttons]" }
          : prev,
      );
      setItems((prev) => {
        const idx = prev.findIndex((c) => c.id === id);
        if (idx === -1) return prev;
        const updated: ConversationListItem = {
          ...prev[idx],
          status: "OPEN",
          lastMessageAt: sent.createdAt,
          lastMessagePreview: sent.text ?? "[buttons]",
          lastMessage: { id: sent.id, direction: sent.direction, text: sent.text, createdAt: sent.createdAt, automated: sent.automated },
        };
        return [updated, ...prev.filter((c) => c.id !== id)];
      });
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send the message"));
      // The window may have closed underneath us; pull fresh state so the composer explains why.
      if (err instanceof InboxApiError && (err.code === "WINDOW_CLOSED" || err.code === "CHANNEL_INACTIVE")) void fetchDetail(id, { silent: true });
      return false;
    } finally {
      setBusyFlag("send", false);
    }
  }

  function onTagsChange(tags: string[]) {
    if (!detail) return;
    const contactId = detail.contact.id;
    setDetail((prev) => (prev ? { ...prev, contact: { ...prev.contact, tags } } : prev));
    setItems((prev) => prev.map((c) => (c.contact.id === contactId ? { ...c, contact: { ...c.contact, tags } } : c)));
  }

  // ───────────── Render ─────────────

  let center: React.ReactNode;
  if (!selectedId) {
    center = (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={MessageSquare}
          title={channels.length === 0 ? "Nothing to show yet" : "Select a conversation"}
          description={channels.length === 0 ? "Connect a channel to start receiving messages." : "Pick a thread on the left to read and reply."}
          className="w-full max-w-sm border-0"
        />
      </div>
    );
  } else if (detail) {
    center = (
      <Thread
        conversation={detail}
        members={members}
        now={now}
        busy={busy}
        onBack={back}
        onAssign={(userId) => void assign(userId)}
        onToggleStatus={() => void toggleStatus()}
        onSync={() => void sync(detail.id)}
        onLoadOlder={() => void loadOlder()}
        onSend={send}
        className="h-full"
      />
    );
  } else if (detailError && !detailLoading) {
    center = (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={MessageSquare}
          title="Conversation unavailable"
          description={detailError}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={back}>
                Back to inbox
              </Button>
              <Button size="sm" onClick={() => void fetchDetail(selectedId)}>
                Try again
              </Button>
            </div>
          }
          className="w-full max-w-sm border-0"
        />
      </div>
    );
  } else {
    center = <ThreadSkeleton />;
  }

  return (
    <InboxFrame>
      <ConversationList
        items={items}
        selectedId={selectedId}
        onSelect={select}
        filter={filter}
        onFilterChange={setFilter}
        channels={channels}
        channelId={channelId}
        onChannelChange={setChannelId}
        query={query}
        onQueryChange={setQuery}
        counts={counts}
        loading={listLoading}
        hasMore={nextCursor !== null}
        loadingMore={loadingMore}
        onLoadMore={() => {
          if (!nextCursor || loadingMore) return;
          setLoadingMore(true);
          apiFetch<ConversationPage>(buildListQuery({ filter, channelId, q: debouncedQuery, cursor: nextCursor }))
            .then((page) => {
              setItems((prev) => {
                const seen = new Set(prev.map((c) => c.id));
                return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
              });
              setNextCursor(page.nextCursor);
            })
            .catch((err: unknown) => toast.error(errorMessage(err, "Couldn't load more conversations")))
            .finally(() => setLoadingMore(false));
        }}
        now={now}
        className={cn("w-full border-r md:w-[340px] md:shrink-0", selectedId ? "hidden md:flex" : "flex")}
      />

      <div className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden md:flex")}>{center}</div>

      {detail ? (
        <ContactPanel conversation={detail} now={now} onTagsChange={onTagsChange} className="hidden w-[300px] shrink-0 border-l xl:flex" />
      ) : selectedId ? (
        // Reserve the pane while the thread loads so the center column doesn't jump in width.
        <aside className="hidden w-[300px] shrink-0 flex-col items-center gap-3 border-l px-5 py-6 xl:flex" aria-hidden="true">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </aside>
      ) : null}
    </InboxFrame>
  );
}

export { InboxShell };
