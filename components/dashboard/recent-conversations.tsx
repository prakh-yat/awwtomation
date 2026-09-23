import Link from "next/link";

import { CardLink } from "@/components/analytics/card-link";
import { stagger } from "@/components/charts/stagger";
import { contactDisplayName, contactHandle, previewText, shortRelative } from "@/components/inbox/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformMark } from "@/components/ui/platform-badge";
import type { RecentConversations as RecentConversationsData } from "@/lib/services/dashboard";
import { cn, formatNumber, initials } from "@/lib/utils";

export function RecentConversations({ data, className }: { data: RecentConversationsData; className?: string }) {
  const now = Date.now();

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardHeader className="shrink-0 flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle>Inbox</CardTitle>
          {data.unread > 0 ? (
            <Badge variant="magenta" dot className="tabular-nums">
              {formatNumber(data.unread)} unread
            </Badge>
          ) : null}
        </div>
        <CardLink href="/inbox">Open inbox</CardLink>
      </CardHeader>

      {data.items.length === 0 ? (
        <p className="flex-1 border-t px-5 py-8 text-[13px] text-muted-foreground">No open conversations.</p>
      ) : (
        <ul className="scrollbar-thin min-h-0 flex-1 divide-y overflow-y-auto border-t">
          {data.items.map((item, i) => {
            const name = contactDisplayName(item.contact);
            const handle = contactHandle(item.contact);
            const unread = item.unreadCount > 0;
            const outbound = item.lastMessage?.direction === "OUTBOUND";
            const prefix = outbound ? (item.lastMessage?.automated ? "Auto: " : "You: ") : "";
            const preview = previewText(item.lastMessagePreview?.trim() || item.lastMessage?.text?.trim() || "No messages yet");
            return (
              <li key={item.id} className="rise" style={stagger(i)}>
                <Link
                  href={`/inbox?c=${encodeURIComponent(item.id)}`}
                  className="flex items-center gap-3 px-5 py-2.5 outline-none transition-colors hover:bg-fog/70 focus-visible:bg-fog"
                >
                  <span className="relative shrink-0">
                    <Avatar className="h-9 w-9">
                      {item.contact.avatarUrl ? <AvatarImage src={item.contact.avatarUrl} alt="" /> : null}
                      <AvatarFallback>{initials(item.contact.name ?? item.contact.username)}</AvatarFallback>
                    </Avatar>
                    <PlatformMark platform={item.channel.platform} size={16} className="absolute -bottom-1 -right-1 ring-2 ring-background" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("truncate text-[13px]", unread ? "font-semibold text-ink" : "font-medium")}>{name}</span>
                      {handle && handle !== name ? <span className="hidden truncate text-xs text-muted-foreground xl:inline">{handle}</span> : null}
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{shortRelative(item.lastMessageAt, now)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("truncate text-xs", unread ? "text-ink" : "text-muted-foreground")}>
                        {prefix}
                        {preview}
                      </span>
                      {unread ? (
                        <>
                          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-magenta" aria-hidden />
                          <span className="sr-only">, {formatNumber(item.unreadCount)} unread</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
