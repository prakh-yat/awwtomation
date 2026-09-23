"use client";

import * as React from "react";
import { AudioLines, CornerUpLeft, ExternalLink, FileText, Film, ImageIcon, Paperclip, Workflow, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PLATFORM_TONE } from "@/components/ui/platform-badge";
import type { PlatformIconPlatform } from "@/components/ui/platform-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { InboxMessage, MessageAttachment } from "@/lib/services/inbox";
import { cn } from "@/lib/utils";

import { formatDateTime, formatTime, userDisplayName } from "./format";

/** Whose message it is, which decides its colour. */
type BubbleTone = "inbound" | "human" | "automated";

const BUBBLE_TONE: Record<BubbleTone, string> = {
  // The contact: fog, like the incoming side of any messaging app.
  inbound: "bg-fog text-ink",
  // Someone on the team.
  human: "bg-ink text-white",
  // An automation or a broadcast, in the Automations purple.
  automated: "bg-purple text-white",
};

/** Chips and link buttons inside a bubble take their surface from the bubble. */
const INNER_SURFACE: Record<BubbleTone, string> = {
  inbound: "bg-background text-ink ring-1 ring-inset ring-border",
  human: "bg-white/15 text-white",
  automated: "bg-white/15 text-white",
};

const KIND: Record<MessageAttachment["kind"], { label: string; icon: LucideIcon }> = {
  image: { label: "Photo", icon: ImageIcon },
  video: { label: "Video", icon: Film },
  audio: { label: "Audio", icon: AudioLines },
  file: { label: "File", icon: FileText },
  unknown: { label: "Attachment", icon: Paperclip },
};

/** Meta attachment types that read better under another name. */
const NAMED_TYPES = new Map<string, string>([
  ["share", "Shared post"],
  ["ig_reel", "Reel"],
  ["reel", "Reel"],
  ["story_mention", "Story mention"],
]);

function attachmentLabel(attachment: MessageAttachment): string {
  const name = attachment.name?.trim();
  if (!name) return KIND[attachment.kind].label;
  const named = NAMED_TYPES.get(name);
  if (named) return named;
  // Without a file name, `name` falls back to Meta's type string ("video", "fallback"); only a real name is worth showing.
  return /^[a-z_]+$/.test(name) ? KIND[attachment.kind].label : name;
}

function AttachmentChip({ attachment, tone }: { attachment: MessageAttachment; tone: BubbleTone }) {
  const Icon = KIND[attachment.kind].icon;
  const label = attachmentLabel(attachment);
  const chipClass = cn("inline-flex max-w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium", INNER_SURFACE[tone]);
  if (attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(chipClass, "outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring")}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      </a>
    );
  }
  return (
    <span className={chipClass}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ImageAttachment({ url, alt }: { url: string; alt: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="block overflow-hidden rounded-2xl border bg-fog outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Meta CDN hosts are unpredictable and URLs expire, so next/image's remotePatterns can't cover them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" className="block max-h-72 w-auto max-w-full object-cover" />
    </a>
  );
}

export type MessageBubbleProps = {
  message: InboxMessage;
  /** The conversation's platform, to say where an echoed message was sent from. */
  platform: PlatformIconPlatform;
  /**
   * Position in a run of messages from the same sender. A run shares its
   * tight corners and shows the sender and time once, under its last bubble.
   */
  first?: boolean;
  last?: boolean;
  /** Arrived while the thread was open, so it rises in. */
  fresh?: boolean;
  className?: string;
};

/**
 * One message: photos, then the bubble, then a meta line (Automated, who sent
 * it, the time) under the last bubble of a run.
 */
function MessageBubble({ message, platform, first = true, last = true, fresh = false, className }: MessageBubbleProps) {
  const outbound = message.direction === "OUTBOUND";
  const tone: BubbleTone = !outbound ? "inbound" : message.automated ? "automated" : "human";
  const images = message.attachments.filter((a) => a.kind === "image" && a.url);
  const others = message.attachments.filter((a) => !(a.kind === "image" && a.url));
  const hasText = Boolean(message.text?.trim());
  const hasMedia = Boolean(message.imageUrl) || images.length > 0;
  const hasExtras = others.length > 0 || message.buttons.length > 0;
  const isEmpty = !hasText && !hasMedia && !hasExtras;
  const hasBubble = hasText || hasExtras || isEmpty;

  // The corner nearest the sender stays tight; later bubbles in a run tighten the top one as well.
  const corners = outbound ? cn("rounded-br-md", !first && "rounded-tr-md") : cn("rounded-bl-md", !first && "rounded-tl-md");

  const meta: string[] = [];
  if (outbound && !message.automated && message.sentBy) meta.push(userDisplayName(message.sentBy));
  if (outbound && message.isEcho) meta.push(`Sent from ${PLATFORM_TONE[platform].label}`);

  return (
    <div className={cn("group flex flex-col", outbound ? "items-end" : "items-start", fresh && "animate-fade-in motion-reduce:animate-none", className)}>
      {message.storyReply ? (
        <span className="mb-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
          <CornerUpLeft className="h-3 w-3" aria-hidden />
          Replied to your story
          {message.storyReply.url ? (
            <>
              <span aria-hidden>·</span>
              <a
                href={message.storyReply.url}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded font-medium text-ink underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                View story
              </a>
            </>
          ) : null}
        </span>
      ) : null}

      {hasMedia ? (
        <div className={cn("flex max-w-[min(82%,20rem)] flex-col gap-1", outbound ? "items-end" : "items-start", hasBubble && "mb-0.5")}>
          {message.imageUrl ? <ImageAttachment url={message.imageUrl} alt="Image sent with this message" /> : null}
          {images.map((a, i) => (
            <ImageAttachment key={`${message.id}-img-${i}`} url={a.url as string} alt={a.name ?? "Image attachment"} />
          ))}
        </div>
      ) : null}

      {hasBubble ? (
        <div className={cn("flex max-w-[min(82%,36rem)] items-end gap-2", outbound && "flex-row-reverse")}>
          <div className={cn("min-w-0 rounded-[20px] px-3.5 py-2 text-[14px] leading-[1.45]", BUBBLE_TONE[tone], corners)}>
            {hasText ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : null}
            {isEmpty ? <p className="italic opacity-70">Can&apos;t be shown here</p> : null}
            {others.length > 0 ? (
              <div className={cn("flex flex-wrap gap-1.5", hasText && "mt-2")}>
                {others.map((a, i) => (
                  <AttachmentChip key={`${message.id}-att-${i}`} attachment={a} tone={tone} />
                ))}
              </div>
            ) : null}
            {message.buttons.length > 0 ? (
              <div className={cn("flex flex-col gap-1.5", (hasText || others.length > 0) && "mt-2.5")}>
                {message.buttons.map((b, i) => (
                  <span
                    key={`${message.id}-btn-${i}`}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-center text-[13px] font-semibold",
                      INNER_SURFACE[tone],
                    )}
                  >
                    {b.title}
                    {b.type === "web_url" ? <ExternalLink className="h-3 w-3 opacity-70" aria-hidden /> : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {/* Inside a run only the last bubble carries the time; the others show it on hover. */}
          {!last ? (
            <time
              dateTime={message.createdAt}
              className="mb-1.5 shrink-0 text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            >
              {formatTime(message.createdAt)}
            </time>
          ) : null}
        </div>
      ) : null}

      {last ? (
        <div className="mt-1 flex max-w-full items-center gap-1.5 px-1 text-[11px] leading-4 text-muted-foreground">
          {message.automated ? (
            <Badge variant="purple" className="py-0">
              <Workflow aria-hidden />
              Automated
            </Badge>
          ) : null}
          {meta.map((text) => (
            <React.Fragment key={text}>
              <span className="truncate">{text}</span>
              <span aria-hidden>·</span>
            </React.Fragment>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <time dateTime={message.createdAt} className="shrink-0 cursor-default tabular-nums">
                {formatTime(message.createdAt)}
              </time>
            </TooltipTrigger>
            <TooltipContent side={outbound ? "left" : "right"}>{formatDateTime(message.createdAt)}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

export { MessageBubble };
