import { ExternalLink, ImageIcon } from "lucide-react";

import type { OutboundMessage } from "@/lib/meta/types";
import { cn } from "@/lib/utils";

export interface DmPreviewProps {
  /** Messages the contact receives, in order. Each renders as one bubble (+ buttons). */
  messages: OutboundMessage[];
  /** Connected account shown in the header (e.g. "@acme"). */
  accountHandle?: string | null;
  accountAvatarUrl?: string | null;
  /** The contact's own message shown above the replies (a comment or DM). */
  contactText?: string | null;
  contactLabel?: string;
  emptyHint?: string;
  className?: string;
}

function Bubble({ message }: { message: OutboundMessage }) {
  const buttons = message.buttons ?? [];
  const hasText = Boolean(message.text?.trim());
  const hasButtons = buttons.length > 0;
  return (
    <div className="flex max-w-[86%] flex-col gap-1.5">
      {message.imageUrl ? (
        <div className="flex h-28 items-center justify-center overflow-hidden rounded-2xl border bg-neutral-100 text-neutral-400">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied host */}
          <img src={message.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      {hasText || hasButtons ? (
        <div className="overflow-hidden rounded-2xl rounded-bl-md border bg-white shadow-card">
          {/* Button templates always carry text; the engine falls back to a pointer emoji too. */}
          <p className="whitespace-pre-wrap break-words px-3 py-2 text-[13px] leading-snug text-foreground">{hasText ? message.text : "👇"}</p>
          {buttons.map((b, i) => (
            <div
              key={i}
              className="flex items-center justify-center gap-1.5 border-t px-3 py-2 text-[13px] font-medium text-foreground"
            >
              <span className="truncate">{b.title || "Button"}</span>
              {b.type === "web_url" ? <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
            </div>
          ))}
        </div>
      ) : !message.imageUrl ? (
        <div className="rounded-2xl rounded-bl-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">Empty message</div>
      ) : null}
      {message.quickReplies && message.quickReplies.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {message.quickReplies.map((q, i) => (
            <span key={i} className="rounded-full border bg-white px-2.5 py-1 text-[12px] font-medium">
              {q.title || "Reply"}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Phone-shaped, monochrome mock of an Instagram DM thread. Renders
 * `OutboundMessage`s exactly as the Send API would present them: text, up to
 * three stacked buttons, an optional image and quick-reply pills.
 */
export function DmPreview({
  messages,
  accountHandle,
  accountAvatarUrl,
  contactText,
  contactLabel = "Their comment",
  emptyHint = "Add a message step to see the preview.",
  className,
}: DmPreviewProps) {
  const handle = accountHandle ? (accountHandle.startsWith("@") ? accountHandle : `@${accountHandle}`) : "@yourbrand";
  return (
    <div className={cn("mx-auto w-[272px] select-none", className)}>
      <div className="rounded-[30px] border-[5px] border-neutral-900 bg-neutral-900 shadow-elevated">
        <div className="flex h-[480px] flex-col overflow-hidden rounded-[25px] bg-neutral-50">
          <div className="mx-auto mt-2 h-4 w-20 rounded-full bg-neutral-900" aria-hidden />
          <div className="flex items-center gap-2 border-b bg-white px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border bg-neutral-100 text-[10px] font-semibold uppercase">
              {accountAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- CDN host varies per platform
                <img src={accountAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                handle.replace("@", "").slice(0, 2)
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold leading-tight">{handle}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">Instagram</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3 scrollbar-thin">
            {contactText ? (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{contactLabel}</span>
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-neutral-900 px-3 py-2 text-[13px] leading-snug text-white">
                  {contactText}
                </div>
              </div>
            ) : null}
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-center text-[12px] text-muted-foreground">
                <span className="max-w-[180px]">{emptyHint}</span>
              </div>
            ) : (
              messages.map((m, i) => <Bubble key={i} message={m} />)
            )}
          </div>
          <div className="flex items-center gap-2 border-t bg-white px-3 py-2">
            <div className="flex h-8 flex-1 items-center rounded-full border bg-neutral-50 px-3 text-[12px] text-muted-foreground">
              Message…
            </div>
            <ImageIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          </div>
        </div>
      </div>
    </div>
  );
}
