"use client";

import * as React from "react";
import Link from "next/link";
import { BellOff, Clock, Link2, SendHorizontal, Unplug, X, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OutboundButton, OutboundMessage } from "@/lib/meta/types";
import type { WindowState } from "@/lib/services/inbox";
import { cn } from "@/lib/utils";

import { WindowBadge } from "./window-badge";

// Meta limits (mirrors lib/meta/messages.ts, which can't be imported client-side).
const MAX_TEXT_BYTES = 1000;
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE_CHARS = 20;
/** The reply box grows with its text up to this height, then scrolls. */
const MAX_TEXTAREA_PX = 176;

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type LinkButton = Extract<OutboundButton, { type: "web_url" }>;

export type ComposerProps = {
  window: WindowState;
  /** Drives the reply window pill; the thread's ticking clock. */
  now: number;
  channelActive: boolean;
  contactOptedOut: boolean;
  contactName: string;
  sending: boolean;
  /** Resolve `true` when the message went out so the draft is cleared. */
  onSend: (message: OutboundMessage, humanAgent: boolean) => Promise<boolean>;
};

function LinkButtonPopover({ disabled, onAdd }: { disabled: boolean; onAdd: (button: LinkButton) => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setTitle("");
    setUrl("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanUrl = normalizeUrl(url);
    if (!cleanTitle) return setError("Give the button a label");
    if (cleanTitle.length > MAX_BUTTON_TITLE_CHARS) return setError(`Labels are limited to ${MAX_BUTTON_TITLE_CHARS} characters`);
    if (!cleanUrl) return setError("Enter a valid link");
    onAdd({ type: "web_url", title: cleanTitle, url: cleanUrl });
    reset();
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label="Add a link button">
              <Link2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Add a link button</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" side="top" className="w-80">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Link button</p>
            <p className="text-xs text-muted-foreground">Up to {MAX_BUTTONS} per message.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="composer-link-title">Label</Label>
            <Input
              id="composer-link-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Get the guide"
              maxLength={MAX_BUTTON_TITLE_CHARS}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="composer-link-url">Link</Label>
            <Input id="composer-link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/guide" inputMode="url" />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Add button
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Why replying is off right now, and the one thing that fixes it when there is one. */
function BlockedNotice({ icon: Icon, children, action }: { icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-fog py-2.5 pl-3 pr-2.5" role="status">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-[13px] text-ink">{children}</p>
      {action}
    </div>
  );
}

/**
 * Reply box. Parent should key this by conversation id so drafts reset when
 * the thread changes. Enter sends, Shift+Enter inserts a newline.
 */
function Composer({ window, now, channelActive, contactOptedOut, contactName, sending, onSend }: ComposerProps) {
  const [text, setText] = React.useState("");
  const [buttons, setButtons] = React.useState<LinkButton[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Past the first 24 hours only a person may reply, and the send has to say
  // so. Everything typed here is typed by a person, so it always does.
  const needsHumanAgent = window.kind === "human_agent";
  const bytes = utf8Bytes(text);
  const overLimit = bytes > MAX_TEXT_BYTES;

  let blocked: { icon: LucideIcon; text: React.ReactNode; action?: React.ReactNode } | null = null;
  if (!channelActive) {
    blocked = {
      icon: Unplug,
      text: "This account is disconnected.",
      action: (
        <Button asChild size="sm" variant="outline" className="bg-background">
          <Link href="/dashboard?accounts=1">Reconnect</Link>
        </Button>
      ),
    };
  } else if (contactOptedOut) {
    blocked = { icon: BellOff, text: `${contactName} opted out of messages.` };
  } else if (window.kind === "closed") {
    blocked = { icon: Clock, text: `You can reply once ${contactName} messages you.` };
  }

  // A draft typed before replying closed stays on screen (read only) rather than vanishing.
  const showInput = !blocked || text.length > 0 || buttons.length > 0;
  const hasContent = text.trim().length > 0 || buttons.length > 0;
  const canSend = !blocked && !sending && hasContent && !overLimit;

  // Grow with the text, up to a cap.
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [text, showInput]);

  async function submit() {
    if (!canSend) return;
    const message: OutboundMessage = {
      text: text.trim() || undefined,
      buttons: buttons.length > 0 ? buttons : undefined,
    };
    const ok = await onSend(message, needsHumanAgent);
    if (ok) {
      setText("");
      setButtons([]);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="shrink-0 bg-background px-3 pb-3 pt-1 sm:px-5 sm:pb-4">
      <div className="mx-auto w-full max-w-4xl space-y-2">
        {blocked ? (
          <BlockedNotice icon={blocked.icon} action={blocked.action}>
            {blocked.text}
          </BlockedNotice>
        ) : null}

        {showInput ? (
          <div
            className={cn(
              "rounded-3xl border bg-background transition-[border-color,box-shadow] duration-150",
              "focus-within:border-ink focus-within:ring-4 focus-within:ring-ring/15",
              overLimit && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15",
              blocked && "opacity-60",
            )}
          >
            {buttons.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                {buttons.map((b, i) => (
                  <span key={`${b.url}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-fog py-1 pl-2.5 pr-1 text-[12px]">
                    <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate font-semibold">{b.title}</span>
                    <span className="hidden truncate text-muted-foreground sm:inline">{b.url}</span>
                    <button
                      type="button"
                      onClick={() => setButtons((prev) => prev.filter((_, j) => j !== i))}
                      disabled={blocked !== null || sending}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      aria-label={`Remove button ${b.title}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={blocked !== null || sending}
              placeholder={`Reply to ${contactName}…`}
              aria-label="Reply"
              aria-invalid={overLimit || undefined}
              className="min-h-0 resize-none rounded-none border-0 bg-transparent px-4 pb-1.5 pt-3 text-[14px] shadow-none hover:border-0 focus-visible:ring-0 disabled:cursor-default disabled:opacity-100"
            />

            <div className="flex items-center gap-2 px-2 pb-2">
              <LinkButtonPopover
                disabled={blocked !== null || sending || buttons.length >= MAX_BUTTONS}
                onAdd={(b) => setButtons((prev) => (prev.length < MAX_BUTTONS ? [...prev, b] : prev))}
              />
              {!blocked ? <WindowBadge window={window} now={now} /> : null}

              <span className="flex-1" />

              {bytes > MAX_TEXT_BYTES * 0.8 ? (
                <span className={cn("shrink-0 text-[11px] tabular-nums", overLimit ? "font-semibold text-destructive" : "text-muted-foreground")}>
                  {bytes}/{MAX_TEXT_BYTES}
                </span>
              ) : text.length > 0 && !blocked ? (
                <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground lg:flex">
                  <Kbd>Shift</Kbd>
                  <Kbd>Enter</Kbd>
                  new line
                </span>
              ) : null}
              <Button type="button" size="sm" onClick={() => void submit()} disabled={!canSend} loading={sending} aria-label="Send reply">
                Send
                <SendHorizontal />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { Composer };
