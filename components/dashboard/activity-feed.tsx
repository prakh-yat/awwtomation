import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Activity } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityItem } from "@/lib/services/analytics";
import { cn } from "@/lib/utils";

import { DELIVERY_KIND_LABELS, DELIVERY_STATUS_LABELS, TONE_DOT_CLASS, contactHandle, deliveryTone } from "./labels";

function Via({ item }: { item: ActivityItem }) {
  if (item.automation) {
    return (
      <>
        {" via "}
        <Link href={`/automations/${item.automation.id}`} className="font-medium text-foreground hover:underline">
          {item.automation.name}
        </Link>
      </>
    );
  }
  if (item.broadcast) {
    return (
      <>
        {" via broadcast "}
        <Link href={`/broadcasts/${item.broadcast.id}`} className="font-medium text-foreground hover:underline">
          {item.broadcast.name}
        </Link>
      </>
    );
  }
  return item.kind === "MESSAGE" ? <> from the inbox</> : null;
}

/** "Sent private reply to @user via Automation" — one line per DeliveryLog row. */
function Sentence({ item }: { item: ActivityItem }) {
  const handle = <span className="font-medium text-foreground">{contactHandle(item.contact?.username ?? item.recipientUsername, item.contact?.name)}</span>;
  const kind = DELIVERY_KIND_LABELS[item.kind];

  if (item.status === "SENT") {
    if (item.kind === "PUBLIC_REPLY") {
      return (
        <>
          Replied publicly to {handle}&apos;s comment
          <Via item={item} />
        </>
      );
    }
    return (
      <>
        Sent {kind} to {handle}
        <Via item={item} />
      </>
    );
  }
  if (item.status === "FAILED") {
    return (
      <>
        Failed to send {kind} to {handle}
        <Via item={item} />
      </>
    );
  }
  return (
    <>
      Skipped {kind} to {handle}
      <Via item={item} />
      <span className="text-muted-foreground"> · {DELIVERY_STATUS_LABELS[item.status]}</span>
    </>
  );
}

export function ActivityFeed({ items, className }: { items: ActivityItem[]; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>The last {items.length > 0 ? items.length : 15} deliveries across your channels</CardDescription>
        </div>
        <Link href="/logs" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          View logs
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-5 pb-12 pt-6 text-center">
            <Activity className="mb-3 h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-sm font-medium">No deliveries yet</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
              As soon as an automation sends its first DM you&apos;ll see it here.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT_CLASS[deliveryTone(item.status)])}
                  aria-label={DELIVERY_STATUS_LABELS[item.status]}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-5 text-muted-foreground">
                    <Sentence item={item} />
                  </p>
                  {item.status === "FAILED" && item.errorMessage ? (
                    <p className="mt-0.5 truncate text-xs text-destructive" title={item.errorMessage}>
                      {item.errorMessage}
                    </p>
                  ) : item.status === "SENT" && item.messagePreview ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/80" title={item.messagePreview}>
                      &ldquo;{item.messagePreview}&rdquo;
                    </p>
                  ) : null}
                </div>
                <time
                  dateTime={item.createdAt.toISOString()}
                  title={format(item.createdAt, "PPpp")}
                  className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                >
                  {formatDistanceToNowStrict(item.createdAt, { addSuffix: true })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
