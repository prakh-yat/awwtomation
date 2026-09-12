"use client";

import { ExternalLink, Paperclip } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { InboxMessage, MessageAttachment } from "@/lib/services/inbox";
import { cn } from "@/lib/utils";

import { formatDateTime, formatTime, userDisplayName } from "./format";

function AttachmentChip({ attachment, outbound }: { attachment: MessageAttachment; outbound: boolean }) {
  const label = attachment.kind === "unknown" ? "[attachment]" : `[${attachment.kind}]`;
  const chipClass = cn(
    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
    outbound ? "border-primary-foreground/25 text-primary-foreground" : "border-border bg-background text-foreground",
  );
  if (attachment.url) {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer noopener" className={cn(chipClass, "hover:underline")}>
        <Paperclip className="h-3 w-3" aria-hidden />
        {attachment.name ?? label}
        <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
      </a>
    );
  }
  return (
    <span className={chipClass}>
      <Paperclip className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

function ImageAttachment({ url, alt }: { url: string; alt: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="block">
      {/* Meta CDN hosts are unpredictable and URLs expire, so next/image's remotePatterns can't cover them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" className="max-h-64 max-w-full rounded-lg border object-cover" />
    </a>
  );
}

/** One message row: bubble plus a small meta line (Automated / human agent / sender / time). */
function MessageBubble({ message }: { message: InboxMessage }) {
  const outbound = message.direction === "OUTBOUND";
  const images = message.attachments.filter((a) => a.kind === "image" && a.url);
  const others = message.attachments.filter((a) => !(a.kind === "image" && a.url));
  const hasText = Boolean(message.text?.trim());
  const isEmpty = !hasText && !message.imageUrl && images.length === 0 && others.length === 0 && message.buttons.length === 0;

  return (
    <div className={cn("group flex flex-col gap-1", outbound ? "items-end" : "items-start")}>
      {message.storyReply ? (
        <span className="px-1 text-[11px] text-muted-foreground">
          Replied to your story
          {message.storyReply.url ? (
            <>
              {" · "}
              <a href={message.storyReply.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-foreground">
                View
              </a>
            </>
          ) : null}
        </span>
      ) : null}

      <div
        className={cn(
          "max-w-[min(75%,32rem)] rounded-2xl px-3.5 py-2 text-sm",
          outbound ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {message.imageUrl ? <ImageAttachment url={message.imageUrl} alt="Image sent with this message" /> : null}
        {images.map((a, i) => (
          <div key={`${message.id}-img-${i}`} className={cn(hasText && "mb-2")}>
            <ImageAttachment url={a.url as string} alt={a.name ?? "Image attachment"} />
          </div>
        ))}
        {hasText ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : null}
        {isEmpty ? <p className="italic opacity-70">(empty message)</p> : null}
        {others.length > 0 ? (
          <div className={cn("flex flex-wrap gap-1.5", hasText && "mt-2")}>
            {others.map((a, i) => (
              <AttachmentChip key={`${message.id}-att-${i}`} attachment={a} outbound={outbound} />
            ))}
          </div>
        ) : null}
        {message.buttons.length > 0 ? (
          <div className={cn("flex flex-col gap-1.5", (hasText || images.length > 0) && "mt-2.5")}>
            {message.buttons.map((b, i) => (
              <span
                key={`${message.id}-btn-${i}`}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-center text-[13px] font-medium",
                  outbound ? "border-primary-foreground/30" : "border-border bg-background",
                )}
              >
                {b.title}
                {b.type === "web_url" ? <ExternalLink className="h-3 w-3 opacity-60" aria-hidden /> : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        {message.automated ? (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            Automated
          </Badge>
        ) : null}
        {message.tag === "HUMAN_AGENT" ? <span>Human agent</span> : null}
        {outbound && !message.automated && message.sentBy ? <span>{userDisplayName(message.sentBy)}</span> : null}
        {outbound && message.isEcho ? <span>Sent from the app</span> : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <time dateTime={message.createdAt} className="cursor-default">
              {formatTime(message.createdAt)}
            </time>
          </TooltipTrigger>
          <TooltipContent side={outbound ? "left" : "right"}>{formatDateTime(message.createdAt)}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export { MessageBubble };
