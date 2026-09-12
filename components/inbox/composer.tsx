"use client";

import * as React from "react";
import Link from "next/link";
import { Link2, SendHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OutboundButton, OutboundMessage } from "@/lib/meta/types";
import type { WindowState } from "@/lib/services/inbox";
import { cn } from "@/lib/utils";

import { WINDOW_RULE_EXPLANATION } from "./window-state";

// Meta limits (mirrors lib/meta/messages.ts, which can't be imported client-side).
const MAX_TEXT_BYTES = 1000;
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE_CHARS = 20;

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
    if (!cleanUrl) return setError("Enter a valid http(s) link");
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
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} aria-label="Insert link button">
              <Link2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Insert link button</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Link button</p>
            <p className="text-xs text-muted-foreground">Shown under your message as a tappable button. Up to {MAX_BUTTONS} per message.</p>
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
            <Label htmlFor="composer-link-url">URL</Label>
            <Input id="composer-link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/guide" inputMode="url" />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
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

/**
 * Reply box. Parent should key this by conversation id so drafts reset when
 * the thread changes. Enter sends, Shift+Enter inserts a newline.
 */
function Composer({ window, channelActive, contactOptedOut, contactName, sending, onSend }: ComposerProps) {
  const [text, setText] = React.useState("");
  const [buttons, setButtons] = React.useState<LinkButton[]>([]);
  // Defaults to on: when the human-agent checkbox is visible, sending without it would be rejected anyway.
  const [humanAgent, setHumanAgent] = React.useState(true);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const needsHumanAgent = window.kind === "human_agent";
  const bytes = utf8Bytes(text);
  const overLimit = bytes > MAX_TEXT_BYTES;

  let blockedReason: React.ReactNode = null;
  if (!channelActive) {
    blockedReason = (
      <>
        This channel is disconnected or its token expired.{" "}
        <Link href="/channels" className="underline underline-offset-2 hover:text-foreground">
          Reconnect it from Channels
        </Link>{" "}
        to reply.
      </>
    );
  } else if (contactOptedOut) {
    blockedReason = <>{contactName} has opted out of messages, so replies can&apos;t be sent.</>;
  } else if (window.kind === "closed") {
    blockedReason = (
      <>
        Meta&apos;s 7-day messaging window has passed. You can reply again once {contactName} messages you.{" "}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="underline underline-offset-2 hover:text-foreground">
              Why?
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs leading-relaxed">
            {WINDOW_RULE_EXPLANATION}
          </TooltipContent>
        </Tooltip>
      </>
    );
  }
  const blocked = blockedReason !== null;

  const hasContent = text.trim().length > 0 || buttons.length > 0;
  const canSend = !blocked && !sending && hasContent && !overLimit && (!needsHumanAgent || humanAgent);

  async function submit() {
    if (!canSend) return;
    const message: OutboundMessage = {
      text: text.trim() || undefined,
      buttons: buttons.length > 0 ? buttons : undefined,
    };
    const ok = await onSend(message, needsHumanAgent && humanAgent);
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

  const rows = Math.min(6, Math.max(1, text.split("\n").length));

  return (
    <div className="border-t bg-background p-3">
      {blocked ? (
        <p className="mb-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{blockedReason}</p>
      ) : null}

      {buttons.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {buttons.map((b, i) => (
            <span key={`${b.url}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-xs">
              <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{b.title}</span>
              <span className="truncate text-muted-foreground">{b.url}</span>
              <button
                type="button"
                onClick={() => setButtons((prev) => prev.filter((_, j) => j !== i))}
                className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={`Remove button ${b.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={cn("rounded-lg border bg-background shadow-sm transition-colors focus-within:border-foreground", blocked && "opacity-60")}>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={rows}
          disabled={blocked || sending}
          placeholder={blocked ? "Replying is unavailable" : `Reply to ${contactName}…`}
          aria-label="Reply"
          aria-invalid={overLimit || undefined}
          className="min-h-0 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <LinkButtonPopover
            disabled={blocked || sending || buttons.length >= MAX_BUTTONS}
            onAdd={(b) => setButtons((prev) => (prev.length < MAX_BUTTONS ? [...prev, b] : prev))}
          />

          {needsHumanAgent && !blocked ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={humanAgent} onCheckedChange={(v) => setHumanAgent(v === true)} aria-label="Send as human agent" />
              Send as human agent (7-day window)
            </label>
          ) : null}

          <span className="flex-1" />

          {bytes > MAX_TEXT_BYTES * 0.8 ? (
            <span className={cn("text-[11px] tabular-nums", overLimit ? "text-destructive" : "text-muted-foreground")}>
              {bytes}/{MAX_TEXT_BYTES}
            </span>
          ) : null}
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Enter to send · Shift+Enter for a new line</span>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={!canSend} loading={sending} aria-label="Send reply">
            <SendHorizontal />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export { Composer };
