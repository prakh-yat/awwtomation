"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Archive, ArchiveRestore, RefreshCw, UserRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OutboundMessage } from "@/lib/meta/types";
import type { ConversationDetail, InboxMessage, InboxUser } from "@/lib/services/inbox";
import { cn, initials } from "@/lib/utils";

import { Composer } from "./composer";
import { contactDisplayName, contactHandle, dayLabel, sameDay, userDisplayName } from "./format";
import { MessageBubble } from "./message-bubble";
import { WindowBadge } from "./window-badge";
import { computeWindowState } from "./window-state";

const UNASSIGNED = "__unassigned__";
/** How close to the bottom (px) the user must be for new messages to auto-scroll into view. */
const STICK_THRESHOLD_PX = 80;

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-2 flex items-center gap-3" role="separator" aria-label={dayLabel(iso)}>
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground">{dayLabel(iso)}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
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

/** Center pane: thread header, the message timeline and the composer. */
function Thread({ conversation, members, now, busy, onBack, onAssign, onToggleStatus, onSync, onLoadOlder, onSend, className }: ThreadProps) {
  const { contact, channel, messages } = conversation;
  const name = contactDisplayName(contact);
  const handle = contactHandle(contact);
  // Recomputed locally so the badge flips the instant a window expires, not on the next poll.
  const window = computeWindowState(conversation.lastInboundAt, now);
  const closed = conversation.status === "CLOSED";

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickToBottomRef = React.useRef(true);
  const prevRef = React.useRef<{ id: string; firstId: string | null; scrollHeight: number } | null>(null);

  // Scroll management: jump to the bottom on thread change, stay pinned while
  // the user is near the bottom, and hold the viewport steady when older
  // messages are prepended above.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const firstId = messages[0]?.id ?? null;
    const prepended = prev && prev.id === conversation.id && prev.firstId !== null && firstId !== prev.firstId && messages.some((m) => m.id === prev.firstId);

    if (!prev || prev.id !== conversation.id) {
      el.scrollTop = el.scrollHeight;
      stickToBottomRef.current = true;
    } else if (prepended) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight;
    } else if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevRef.current = { id: conversation.id, firstId, scrollHeight: el.scrollHeight };
  }, [conversation.id, messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
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

  const timeline: React.ReactNode[] = [];
  messages.forEach((message: InboxMessage, i) => {
    const previous = messages[i - 1];
    if (!previous || !sameDay(previous.createdAt, message.createdAt)) {
      timeline.push(<DaySeparator key={`day-${message.id}`} iso={message.createdAt} />);
    }
    timeline.push(<MessageBubble key={message.id} message={message} />);
  });

  return (
    <section className={cn("flex min-h-0 flex-col", className)} aria-label={`Conversation with ${name}`}>
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 sm:px-4">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>

        <Link href={`/contacts/${contact.id}`} className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-8 w-8">
            {contact.avatarUrl ? <AvatarImage src={contact.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials(contact.name ?? contact.username)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {handle && handle !== name ? handle : channel.username ? `via @${channel.username}` : channel.platform.toLowerCase()}
            </span>
          </span>
        </Link>

        <Badge variant="outline" className="hidden sm:inline-flex">
          <PlatformIcon platform={channel.platform} size={11} />
          {channel.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
        </Badge>
        <WindowBadge window={window} now={now} />
        {closed ? <Badge variant="secondary">Closed</Badge> : null}

        <div className="ml-auto flex items-center gap-1.5">
          <Select value={assignedValue} onValueChange={(v) => onAssign(v === UNASSIGNED ? null : v)} disabled={busy.assign || members === null}>
            <SelectTrigger className="h-8 w-[150px] text-[13px]" aria-label="Assign conversation">
              <SelectValue placeholder="Assign" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {assignOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {userDisplayName(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" variant="outline" size="sm" onClick={onToggleStatus} loading={busy.status}>
            {closed ? <ArchiveRestore /> : <Archive />}
            {closed ? "Reopen" : "Close"}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onSync} disabled={busy.sync} aria-label="Refresh from Meta">
                <RefreshCw className={cn(busy.sync && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pull the latest messages from Meta</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 xl:hidden">
                <Link href={`/contacts/${contact.id}`} aria-label="View contact">
                  <UserRound />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View contact</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-4 sm:px-6">
        {conversation.hasMoreMessages ? (
          <div className="mb-3 flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={onLoadOlder} loading={busy.older}>
              Load earlier messages
            </Button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">No messages yet</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
              {busy.sync ? "Checking Meta for earlier messages…" : "Messages will appear here as they arrive. Use refresh to pull history from Meta."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">{timeline}</div>
        )}
      </div>

      <Composer
        key={conversation.id}
        window={window}
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
