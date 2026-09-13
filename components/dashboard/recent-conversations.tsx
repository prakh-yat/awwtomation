import Link from "next/link";

import { contactDisplayName, contactHandle, shortRelative } from "@/components/inbox/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import type { RecentConversations as RecentConversationsData } from "@/lib/services/dashboard";
import { cn, formatNumber, initials } from "@/lib/utils";

export function RecentConversations({ data }: { data: RecentConversationsData }) {
  const now = Date.now();
  const summary =
    data.open === 0 ? "No open conversations" : `${formatNumber(data.open)} open${data.unread > 0 ? ` · ${formatNumber(data.unread)} unread` : ""}`;

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle>Inbox</CardTitle>
          <CardDescription>{summary}</CardDescription>
        </div>
        <Link href="/inbox" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Open inbox
        </Link>
      </CardHeader>

      {data.items.length === 0 ? (
        <div className="flex flex-1 items-center border-t px-5 py-8">
          <p className="text-[13px] text-muted-foreground">When someone replies to a DM, the conversation shows up here.</p>
        </div>
      ) : (
        <ul className="divide-y border-t">
          {data.items.map((item) => {
            const name = contactDisplayName(item.contact);
            const handle = contactHandle(item.contact);
            const unread = item.unreadCount > 0;
            const outbound = item.lastMessage?.direction === "OUTBOUND";
            const prefix = outbound ? (item.lastMessage?.automated ? "Auto: " : "You: ") : "";
            const preview = item.lastMessagePreview?.trim() || item.lastMessage?.text?.trim() || "No messages yet";
            return (
              <li key={item.id}>
                <Link
                  href={`/inbox?c=${encodeURIComponent(item.id)}`}
                  className="flex items-center gap-3 px-5 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60"
                >
                  <span className="relative shrink-0">
                    <Avatar className="h-8 w-8">
                      {item.contact.avatarUrl ? <AvatarImage src={item.contact.avatarUrl} alt="" /> : null}
                      <AvatarFallback>{initials(item.contact.name ?? item.contact.username)}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
                      <PlatformIcon platform={item.channel.platform} size={9} />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("truncate text-[13px]", unread ? "font-semibold" : "font-medium")}>{name}</span>
                      {handle && handle !== name ? <span className="hidden truncate text-xs text-muted-foreground xl:inline">{handle}</span> : null}
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{shortRelative(item.lastMessageAt, now)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("truncate text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
                        {prefix}
                        {preview}
                      </span>
                      {unread ? <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" aria-label={`${item.unreadCount} unread`} /> : null}
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
