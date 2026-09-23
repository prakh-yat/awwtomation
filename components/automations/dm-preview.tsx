import { ExternalLink, ImageIcon, Smile } from "lucide-react";

import { PlatformMark } from "@/components/ui/platform-badge";
import type { OutboundMessage } from "@/lib/meta/types";
import { cn } from "@/lib/utils";

export interface DmPreviewProps {
  /** Messages the contact receives, in order. Each renders as one bubble (+ buttons). */
  messages: OutboundMessage[];
  /** Connected account shown in the header (e.g. "@acme"). */
  accountHandle?: string | null;
  accountAvatarUrl?: string | null;
  /** Which app the thread is drawn as. */
  platform?: "INSTAGRAM" | "FACEBOOK" | null;
  /** The contact's own message shown above the replies (a comment or DM). */
  contactText?: string | null;
  contactLabel?: string;
  emptyHint?: string;
  className?: string;
}

const THEME = {
  INSTAGRAM: { name: "Instagram", own: "bg-purple text-white", action: "text-purple-ink", pill: "border-purple/40 text-purple-ink" },
  FACEBOOK: { name: "Messenger", own: "bg-blue text-white", action: "text-blue-ink", pill: "border-blue/40 text-blue-ink" },
} as const;

function Bubble({ message, theme, index }: { message: OutboundMessage; theme: (typeof THEME)[keyof typeof THEME]; index: number }) {
  const buttons = message.buttons ?? [];
  const hasText = Boolean(message.text?.trim());
  const hasButtons = buttons.length > 0;
  return (
    <div className="flex max-w-[86%] animate-fade-in flex-col gap-1.5" style={{ animationDelay: `${index * 60}ms` }}>
      {message.imageUrl ? (
        <div className="flex h-28 items-center justify-center overflow-hidden rounded-[18px] bg-fog text-mute">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied host */}
          <img src={message.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      {hasText || hasButtons ? (
        <div className="overflow-hidden rounded-[18px] rounded-bl-md bg-[#efefef]">
          {/* Button templates always carry text; the engine falls back to a pointer emoji too. */}
          <p className="whitespace-pre-wrap break-words px-3 py-2 text-[13px] leading-snug text-ink">{hasText ? message.text : "👇"}</p>
          {buttons.map((b, i) => (
            <div key={i} className={cn("flex items-center justify-center gap-1.5 border-t border-white bg-white/70 px-3 py-2 text-[13px] font-semibold", theme.action)}>
              <span className="truncate">{b.title || "Button"}</span>
              {b.type === "web_url" ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
            </div>
          ))}
        </div>
      ) : !message.imageUrl ? (
        <div className="rounded-[18px] rounded-bl-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">Empty message</div>
      ) : null}
      {message.quickReplies && message.quickReplies.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {message.quickReplies.map((q, i) => (
            <span key={i} className={cn("rounded-full border bg-white px-2.5 py-1 text-[12px] font-semibold", theme.pill)}>
              {q.title || "Reply"}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A phone showing the conversation from the contact's side: what they wrote on
 * the right in the app's own colour, what the account sends on the left, with
 * buttons and quick replies as the app draws them.
 */
export function DmPreview({
  messages,
  accountHandle,
  accountAvatarUrl,
  platform,
  contactText,
  contactLabel = "Their comment",
  emptyHint = "Add a message step to see it here.",
  className,
}: DmPreviewProps) {
  const handle = accountHandle ? (accountHandle.startsWith("@") ? accountHandle : `@${accountHandle}`) : "@yourbrand";
  const key = platform === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM";
  const theme = THEME[key];
  return (
    <div className={cn("mx-auto w-[272px] select-none", className)}>
      <div className="rounded-[38px] bg-ink p-[7px] shadow-pop">
        <div className="flex h-[500px] flex-col overflow-hidden rounded-[31px] bg-white">
          <div className="mx-auto mt-2.5 h-[18px] w-[76px] rounded-full bg-ink" aria-hidden />
          <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-lavender text-[10px] font-semibold uppercase">
              {accountAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- CDN host varies per platform
                <img src={accountAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                handle.replace("@", "").slice(0, 2)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-tight">{handle}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">{theme.name}</p>
            </div>
            <PlatformMark platform={key} size={18} />
          </div>
          <div className="scrollbar-thin flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
            {contactText ? (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">{contactLabel}</span>
                <div className={cn("max-w-[80%] rounded-[18px] rounded-br-md px-3 py-2 text-[13px] leading-snug", theme.own)}>{contactText}</div>
              </div>
            ) : null}
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-center text-[12px] text-muted-foreground">
                <span className="max-w-[180px]">{emptyHint}</span>
              </div>
            ) : (
              messages.map((m, i) => <Bubble key={i} message={m} theme={theme} index={i} />)
            )}
          </div>
          <div className="flex items-center gap-2 px-3 pb-4 pt-2">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-fog px-3 text-[12px] text-muted-foreground">
              <Smile className="h-4 w-4" strokeWidth={1.75} />
              Message…
            </div>
            <ImageIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          </div>
        </div>
      </div>
    </div>
  );
}
