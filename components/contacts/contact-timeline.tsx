import Link from "next/link";
import { Activity, MessageSquare, MousePointerClick, Reply, Send, Workflow, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ContactDetail } from "@/lib/services/contacts";
import { cn } from "@/lib/utils";

import { formatAbsolute, formatRelative, platformLabel } from "./format";

export type TimelineTone = "ok" | "warn" | "error" | "neutral";

export type TimelineEvent = {
  id: string;
  at: Date;
  kind: "delivery" | "session" | "click" | "message_in" | "message_out";
  title: string;
  detail?: string | null;
  tone: TimelineTone;
  /** Small trailing label, e.g. a flow session status. */
  badge?: { label: string; variant: "secondary" | "success" | "warning" | "destructive" | "outline" };
  href?: string;
};

const TIMELINE_MAX = 60;

const KIND_LABEL: Record<ContactDetail["deliveryLogs"][number]["kind"], string> = {
  PRIVATE_REPLY: "Private reply",
  MESSAGE: "Message",
  PUBLIC_REPLY: "Public comment reply",
  BROADCAST: "Broadcast",
};

function humanizeStatus(status: string): string {
  return status.toLowerCase().replace(/^skipped_/, "skipped — ").replace(/_/g, " ");
}

/**
 * Merges delivery logs, flow sessions, link clicks and inbound messages into
 * one reverse-chronological feed. Outbound messages are represented by their
 * DeliveryLog (every send writes one), so only inbound messages and manual
 * sends from the Instagram/Facebook app (echoes) are taken from Message.
 */
export function buildTimeline(detail: ContactDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const log of detail.deliveryLogs) {
    const via = log.automation ? ` · ${log.automation.name}` : log.broadcast ? ` · ${log.broadcast.name}` : "";
    const sent = log.status === "SENT";
    const failed = log.status === "FAILED";
    events.push({
      id: `delivery:${log.id}`,
      at: log.createdAt,
      kind: "delivery",
      title: `${KIND_LABEL[log.kind]} ${sent ? "sent" : failed ? "failed" : humanizeStatus(log.status)}${via}`,
      detail: sent ? log.messagePreview : (log.errorMessage ?? log.messagePreview),
      tone: sent ? "ok" : failed ? "error" : "warn",
      href: log.automation ? `/automations/${log.automation.id}` : log.broadcast ? `/broadcasts/${log.broadcast.id}` : undefined,
    });
  }

  for (const session of detail.flowSessions) {
    const badge =
      session.status === "ACTIVE"
        ? { label: "In progress", variant: "secondary" as const }
        : session.status === "COMPLETED"
          ? { label: "Completed", variant: "success" as const }
          : { label: "Expired", variant: "outline" as const };
    events.push({
      id: `session:${session.id}`,
      at: session.createdAt,
      kind: "session",
      title: `Entered flow “${session.automation.name}”`,
      detail: session.currentNodeId && session.status === "ACTIVE" ? `Waiting at step ${session.currentNodeId}` : null,
      tone: "neutral",
      badge,
      href: `/automations/${session.automation.id}`,
    });
  }

  for (const click of detail.linkClicks) {
    events.push({
      id: `click:${click.id}`,
      at: click.createdAt,
      kind: "click",
      title: `Clicked link ${click.link.label ?? `/l/${click.link.slug}`}`,
      detail: click.link.destinationUrl,
      tone: "ok",
      href: "/links",
    });
  }

  const platform = platformLabel(detail.contact.platform);
  for (const message of detail.messages) {
    if (message.direction === "INBOUND") {
      events.push({ id: `msg:${message.id}`, at: message.createdAt, kind: "message_in", title: "Message received", detail: message.text, tone: "neutral" });
    } else if (!message.automated && !message.sentByUserId) {
      events.push({ id: `msg:${message.id}`, at: message.createdAt, kind: "message_out", title: `Sent manually from ${platform}`, detail: message.text, tone: "neutral" });
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, TIMELINE_MAX);
}

const ICONS: Record<TimelineEvent["kind"], LucideIcon> = {
  delivery: Send,
  session: Workflow,
  click: MousePointerClick,
  message_in: MessageSquare,
  message_out: Reply,
};

const TONE_DOT: Record<TimelineTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

export interface ContactTimelineProps {
  events: TimelineEvent[];
  timezone: string;
}

function ContactTimeline({ events, timezone }: ContactTimelineProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Messages sent, flows entered and link clicks will show up here as they happen."
        className="py-10"
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, i) => {
        const Icon = ICONS[event.kind];
        const last = i === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-5">
            {!last ? <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px bg-border" /> : null}
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-foreground shadow-card">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span aria-hidden className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background", TONE_DOT[event.tone])} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-medium leading-5">
                  {event.href ? (
                    <Link href={event.href} className="hover:underline">
                      {event.title}
                    </Link>
                  ) : (
                    event.title
                  )}
                  {event.badge ? (
                    <Badge variant={event.badge.variant} className="ml-2 align-middle">
                      {event.badge.label}
                    </Badge>
                  ) : null}
                </p>
                <time
                  dateTime={event.at.toISOString()}
                  title={formatAbsolute(event.at, timezone)}
                  className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground"
                  suppressHydrationWarning
                >
                  {formatRelative(event.at)}
                </time>
              </div>
              {event.detail ? <p className="mt-0.5 line-clamp-2 break-words text-[12px] text-muted-foreground">{event.detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { ContactTimeline };
