import type { ChannelPlatform } from "@prisma/client";
import { ImageIcon } from "lucide-react";

import type { OutboundMessage } from "@/lib/meta/types";
import { cn, initials } from "@/lib/utils";

export interface MessagePreviewProps {
  message: OutboundMessage;
  platform?: ChannelPlatform;
  /** Shown in the chat header: usually the channel's @username or page name. */
  senderName?: string;
  senderAvatarUrl?: string | null;
  className?: string;
}

const SAMPLE_VARS: Record<string, string> = { username: "@sita.rai", name: "Sita Rai", first_name: "Sita" };
const TEMPLATE_RE = /\{\{\s*([A-Za-z_][\w.]*)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

/** Mirrors lib/automation/flow-types.renderTemplate with sample values so the preview reads naturally. */
function fillSample(text: string): string {
  return text.replace(TEMPLATE_RE, (_m, key: string, fallback?: string) => SAMPLE_VARS[key.toLowerCase()] ?? fallback ?? "");
}

/**
 * Phone-shaped, monochrome mock of how an OutboundMessage lands in the
 * recipient's DM thread. Self-contained (no hooks) so both the editor and
 * the read-only report can render it.
 */
function MessagePreview({ message, platform = "INSTAGRAM", senderName = "Your account", senderAvatarUrl, className }: MessagePreviewProps) {
  const text = message.text?.trim() ? fillSample(message.text.trim()) : "";
  const buttons = (message.buttons ?? []).filter((b) => b.title.trim());
  const quickReplies = message.quickReplies ?? [];
  const hasContent = Boolean(text || message.imageUrl || buttons.length);

  return (
    <div className={cn("mx-auto w-[300px] select-none rounded-[2.25rem] border-[6px] border-foreground bg-background shadow-elevated", className)} aria-label="Message preview">
      <div className="flex h-[580px] flex-col overflow-hidden rounded-[1.85rem]">
        <div className="mx-auto mt-2 h-5 w-24 shrink-0 rounded-full bg-foreground" aria-hidden />

        <div className="flex shrink-0 items-center gap-2.5 border-b px-4 pb-2.5 pt-3">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-medium">
            {senderAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar, no optimisation wanted
              <img src={senderAvatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              initials(senderName)
            )}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium">{senderName}</p>
            <p className="text-[10px] text-muted-foreground">{platform === "FACEBOOK" ? "Messenger" : "Instagram"}</p>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3 py-4">
          <p className="text-center text-[10px] text-muted-foreground">Today</p>

          {!hasContent ? (
            <div className="mr-10 rounded-2xl rounded-bl-md border border-dashed px-3 py-6 text-center text-[12px] text-muted-foreground">
              Your message will appear here
            </div>
          ) : null}

          {message.imageUrl ? (
            <div className="mr-10 overflow-hidden rounded-2xl rounded-bl-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URL rendered as Meta would */}
              <img src={message.imageUrl} alt="" className="block max-h-56 w-full object-cover" referrerPolicy="no-referrer" />
            </div>
          ) : null}

          {buttons.length > 0 ? (
            <div className="mr-10 overflow-hidden rounded-2xl rounded-bl-md border bg-background">
              {text ? <p className="whitespace-pre-wrap break-words bg-muted px-3 py-2 text-[13px] leading-snug">{text}</p> : null}
              <div className="divide-y">
                {buttons.map((b, i) => (
                  <div key={i} className="px-3 py-2 text-center text-[13px] font-medium">
                    {fillSample(b.title)}
                  </div>
                ))}
              </div>
            </div>
          ) : text ? (
            <div className="mr-10 whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-[13px] leading-snug">{text}</div>
          ) : null}

          {quickReplies.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickReplies.map((q, i) => (
                <span key={i} className="rounded-full border px-2.5 py-1 text-[12px]">
                  {fillSample(q.title)}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t px-3 py-2">
          <div className="flex h-8 items-center gap-2 rounded-full border bg-background px-3 text-[12px] text-muted-foreground">
            <span className="flex-1">Message…</span>
            <ImageIcon className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

export { MessagePreview };
