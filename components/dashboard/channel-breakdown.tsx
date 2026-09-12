import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ChannelBreakdownRow } from "@/lib/services/analytics";
import { cn, formatNumber } from "@/lib/utils";

import { CHANNEL_STATUS_LABELS, TONE_DOT_CLASS, channelTone, contactHandle } from "./labels";

export function ChannelBreakdown({ rows }: { rows: ChannelBreakdownRow[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Channels</CardTitle>
          <CardDescription>Activity per connected account</CardDescription>
        </div>
        <Link href="/channels" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Manage
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {rows.length === 0 ? (
          <p className="px-5 pb-6 text-[13px] text-muted-foreground">No channels connected yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Channel</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Triggers</TableHead>
                <TableHead className="pr-5 text-right">New contacts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[180px] pl-5">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT_CLASS[channelTone(c.status)])}
                        title={CHANNEL_STATUS_LABELS[c.status]}
                        aria-label={CHANNEL_STATUS_LABELS[c.status]}
                      />
                      <PlatformIcon platform={c.platform} size={13} className="text-muted-foreground" />
                      <span className="truncate font-medium" title={c.name ?? undefined}>
                        {contactHandle(c.username, c.name)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(c.sent)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(c.triggered)}</TableCell>
                  <TableCell className="pr-5 text-right tabular-nums" title={`${formatNumber(c.contacts)} contacts in total`}>
                    {formatNumber(c.newContacts)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
