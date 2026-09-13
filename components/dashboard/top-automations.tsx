import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TopAutomation } from "@/lib/services/analytics";
import { cn, formatNumber } from "@/lib/utils";

import { AUTOMATION_STATUS_LABELS, contactHandle } from "./labels";

function rate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

export function TopAutomations({
  automations,
  days,
  showAccount = true,
  className,
}: {
  automations: TopAutomation[];
  days: number;
  /** Off when the workspace has a single account, where the column would repeat one handle. */
  showAccount?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle>Top automations</CardTitle>
          <CardDescription>By DMs sent in the last {days} days</CardDescription>
        </div>
        <Link href="/automations" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          All automations
        </Link>
      </CardHeader>

      {automations.length === 0 ? (
        <div className="border-t px-5 py-8">
          <p className="text-[13px] text-muted-foreground">No automation sent a DM in this period.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Automation</TableHead>
                {showAccount ? <TableHead className="hidden md:table-cell">Account</TableHead> : null}
                <TableHead className="text-right">DMs sent</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Clicks</TableHead>
                <TableHead className="pr-5 text-right">Click rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-[260px] pl-5">
                    <span className="flex min-w-0 items-center gap-2">
                      <Link href={`/automations/${a.id}`} className="truncate font-medium underline-offset-4 hover:underline" title={a.name}>
                        {a.name}
                      </Link>
                      {a.status !== "ACTIVE" ? <Badge variant="secondary">{AUTOMATION_STATUS_LABELS[a.status]}</Badge> : null}
                    </span>
                  </TableCell>
                  {showAccount ? (
                    <TableCell className="hidden max-w-[200px] md:table-cell">
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <PlatformIcon platform={a.channel.platform} size={13} className="shrink-0" />
                        <span className="truncate">{contactHandle(a.channel.username, a.channel.name)}</span>
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right font-medium tabular-nums">{formatNumber(a.sent)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(a.clicks)}</TableCell>
                  <TableCell className="pr-5 text-right tabular-nums">{rate(a.ctr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
