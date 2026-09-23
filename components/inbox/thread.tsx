"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, CircleCheck, MessageSquare, RefreshCw, RotateCcw, UserRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PLATFORM_TONE, PlatformMark } from "@/components/ui/platform-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OutboundMessage } from "@/lib/meta/types";
import type { ConversationDetail, InboxMessage, InboxUser } from "@/lib/services/inbox";
import { cn, initials } from "@/lib/utils";

import { Composer } from "./composer";
import { contactDisplayName, contactHandle, dayLabel, sameDay, userDisplayName } from "./format";
import { MessageBubble } from "./message-bubble";
import { computeWindowState } from "./window-state";

const UNASSIGNED = "__unassigned__";
/** How close to the bottom (px) the user must be for new messages to auto-scroll into view. */
const STICK_THRESHOLD_PX = 80;
/** Scrolled further up than this, a button to jump back to the latest message appears. */
const JUMP_THRESHOLD_PX = 320;
/** Messages from the same sender closer together than this read as one run. */
const RUN_GAP_MS = 5 * 60 * 1000;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Same side, same sender, same day and a few minutes apart: stacked as one run, like any chat app. */
function sameRun(a: InboxMessage, b: InboxMessage): boolean {
  return (
    a.direction === b.direction &&
    a.automated === b.automated &&
    a.isEcho === b.isEcho &&
    (a.sentBy?.id ?? null) === (b.sentBy?.id ?? null) &&
    sameDay(a.createdAt, b.createdAt) &&
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < RUN_GAP_MS
  );
}

/**
 * A day marker. It is the first child of its day's group, so it sticks to the
 * top of the timeline while that day is on screen and leaves with it.
 */
function DaySeparator({ iso }: { iso: string }) {
  const label = dayLabel(iso);
  return (
    <div className="sticky top-2 z-10 mb-3 flex justify-center" role="separator" aria-label={label}>
      <span className="brand-label rounded-full border bg-background px-3 py-1.5 text-mute shadow-card">{label}</span>
    </div>
  );
}

function AssigneeOption({ user }: { user: InboxUser | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {user ? (
        <Avatar className="h-5 w-5" aria-hidden>
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-[9px]">{initials(user.name ?? user.email)}</AvatarFallback>
        </Avatar>
      ) : (
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-mute/50 text-muted-foreground">
          <UserRound className="h-3 w-3" />
        </span>
      )}
      <span data-assignee-name="" className="truncate">
        {user ? userDisplayName(user) : "Unassigned"}
      </span>
    </span>
  );
}

export type ThreadBusy = { assign: boolean; status: boolean; sync: boolean; older: boolean; send: boolean };

export type ThreadProps = {
  conversation: ConversationDetail;
  /** null while the member list is still loading. */
  members: InboxUser[] | null;
  now: number;
  busy: ThreadBusy;
  onBack: () => void;
  onAssign: (userId: string | null) => void;
  onToggleStatus: () => void;
  onSync: () => void;
  onLoadOlder: () => void;
  onSend: (message: OutboundMessage, humanAgent: boolean) => Promise<boolean>;
  className?: string;
};

/**
 * Center pane: thread header, the message timeline and the composer. The
 * parent keys it by conversation id, so every thread starts at its latest
 * message with fresh local state.
 */
function Thread({ conversation, members, now, busy, onBack, onAssign, onToggleStatus, onSync, onLoadOlder, onSend, className }: ThreadProps) {
  const { contact, channel, messages } = conversation;
  const name = contactDisplayName(contact);
  const handle = contactHandle(contact);
  // Recomputed locally so the pill flips the instant a window expires, not on the next poll.
  const replyWindow = computeWindowState(conversation.lastInboundAt, now);
  const closed = conversation.status === "CLOSED";

  const account = channel.username ? `@${channel.username}` : channel.name;
  const who = handle && handle !== name ? handle : PLATFORM_TONE[channel.platform].product;
  const subtitle = account ? `${who} · via ${account}` : who;

  // Messages newer than what the thread opened with rise in; history (and older pages) doesn't.
  const [openedWithNewest] = React.useState(() => messages[messages.length - 1]?.createdAt ?? "");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const stickToBottomRef = React.useRef(true);
  const prevRef = React.useRef<{ id: string; firstId: string | null; lastId: string | null; scrollHeight: number } | null>(null);
  const [awayFromBottom, setAwayFromBottom] = React.useState(false);
  const [unseen, setUnseen] = React.useState(false);

  // Scroll management: start at the bottom, stay pinned while the user is near
  // the bottom, and hold the viewport steady when older messages are prepended
  // above. Something arriving while the user reads further up is flagged on
  // the jump button instead of yanking the view.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const firstId = messages[0]?.id ?? null;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const sameThread = prev !== null && prev.id === conversation.id;
    const prepended = sameThread && prev.firstId !== null && firstId !== prev.firstId && messages.some((m) => m.id === prev.firstId);

    if (!sameThread) {
      el.scrollTop = el.scrollHeight;
      stickToBottomRef.current = true;
    } else if (prepended) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight;
    } else if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (lastId !== prev.lastId) {
      setUnseen(true);
    }
    prevRef.current = { id: conversation.id, firstId, lastId, scrollHeight: el.scrollHeight };
  }, [conversation.id, messages]);

  // Photos load after the text around them; keep the latest message in view while they do.
  React.useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < STICK_THRESHOLD_PX;
    setAwayFromBottom(distance > JUMP_THRESHOLD_PX);
    if (distance < STICK_THRESHOLD_PX) setUnseen(false);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  async function handleSend(message: OutboundMessage, humanAgent: boolean): Promise<boolean> {
    // Your own reply should always come into view, even if you'd scrolled up.
    stickToBottomRef.current = true;
    return onSend(message, humanAgent);
  }

  const assignedValue = conversation.assignedTo?.id ?? UNASSIGNED;
  // The assignee might have left the workspace; keep them selectable so the value still renders.
  const assignOptions: InboxUser[] =
    members && conversation.assignedTo && !members.some((m) => m.id === conversation.assignedTo?.id)
      ? [...members, conversation.assignedTo]
      : (members ?? (conversation.assignedTo ? [conversation.assignedTo] : []));

  const days: Array<{ key: string; iso: string; items: React.ReactNode[] }> = [];
  messages.forEach((message, i) => {
    const previous = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
    // Keyed by the calendar day, not its first message, so loading older pages doesn't remount the day.
    if (newDay) days.push({ key: new Date(message.createdAt).toDateString(), iso: message.createdAt, items: [] });
    const first = !previous || !sameRun(previous, message);
    days[days.length - 1].items.push(
      <MessageBubble
        key={message.id}
        message={message}
        platform={channel.platform}
        first={first}
        last={!next || !sameRun(message, next)}
        fresh={message.createdAt > openedWithNewest}
        className={first && !newDay ? "mt-3" : undefined}
      />,
    );
  });

  const showJump = messages.length > 0 && (awayFromBottom || unseen);

  return (
    <section className={cn("flex min-h-0 flex-col bg-background", className)} aria-label={`Conversation with ${name}`}>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-5">
        <Button type="button" variant="ghost" size="icon" className="-ml-1 md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>

        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${contact.id}`}
            className="inline-flex max-w-full items-center gap-3 rounded-2xl py-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="relative shrink-0">
              <Avatar className="h-10 w-10" aria-hidden>
                {contact.avatarUrl ? <AvatarImage src={contact.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[12px]">{initials(contact.name ?? contact.username)}</AvatarFallback>
              </Avatar>
              <PlatformMark platform={channel.platform} size={16} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[15px] font-semibold leading-5 text-ink">{name}</span>
                {closed ? <Badge variant="secondary">Closed</Badge> : null}
              </span>
              <span className="block truncate text-[12px] leading-4 text-muted-foreground">{subtitle}</span>
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <Select value={assignedValue} onValueChange={(v) => onAssign(v === UNASSIGNED ? null : v)} disabled={busy.assign || members === null}>
            <SelectTrigger
              aria-label="Assign conversation"
              className="h-9 w-auto max-w-[200px] gap-1.5 rounded-full px-2 text-[13px] font-medium sm:px-3 [&_[data-assignee-name]]:hidden sm:[&_[data-assignee-name]]:inline"
            >
              <SelectValue placeholder="Assign" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={UNASSIGNED}>
                <AssigneeOption user={null} />
              </SelectItem>
              {assignOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <AssigneeOption user={m} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleStatus}
            loading={busy.status}
            aria-label={closed ? "Reopen conversation" : "Close conversation"}
            className="h-9 px-3 sm:px-3.5"
          >
            {closed ? <RotateCcw /> : <CircleCheck />}
            <span className="hidden sm:inline">{closed ? "Reopen" : "Close"}</span>
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={onSync} disabled={busy.sync} aria-label="Refresh messages">
                <RefreshCw className={cn(busy.sync && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh messages</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex xl:hidden">
                <Link href={`/contacts/${contact.id}`} aria-label="View contact">
                  <UserRound />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View contact</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto scrollbar-thin">
          <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-4 sm:px-6">
            {conversation.hasMoreMessages ? (
              <div className="mb-3 flex justify-center">
                <Button type="button" variant="secondary" size="sm" onClick={onLoadOlder} loading={busy.older}>
                  Load earlier messages
                </Button>
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-8">
                {busy.sync ? (
                  <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Spinner size="sm" />
                    Loading messages
                  </p>
                ) : (
                  <EmptyState
                    compact
                    tone="magenta"
                    icon={MessageSquare}
                    title="No messages yet"
                    action={
                      <Button type="button" variant="outline" size="sm" onClick={onSync}>
                        <RefreshCw />
                        Refresh
                      </Button>
                    }
                    className="w-full max-w-sm"
                  />
                )}
              </div>
            ) : (
              // Pushed to the bottom, so a short thread sits next to the composer like any chat.
              <div className="mt-auto flex flex-col">
                {days.map((day) => (
                  <div key={day.key} className="flex flex-col gap-0.5 pt-5 first:pt-0">
                    <DaySeparator iso={day.iso} />
                    {day.items}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showJump ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              type="button"
              onClick={jumpToLatest}
              className="pointer-events-auto flex h-9 animate-fade-in items-center gap-1.5 rounded-full border bg-background px-3.5 text-[12px] font-semibold text-ink shadow-elevated transition-colors hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:animate-none"
            >
              {unseen ? <span aria-hidden className="h-2 w-2 rounded-full bg-magenta" /> : null}
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              {unseen ? "New messages" : "Jump to latest"}
            </button>
          </div>
        ) : null}
      </div>

      <Composer
        key={conversation.id}
        window={replyWindow}
        now={now}
        channelActive={channel.status === "ACTIVE"}
        contactOptedOut={contact.optedOut}
        contactName={name}
        sending={busy.send}
        onSend={handleSend}
      />
    </section>
  );
}

export { Thread };
