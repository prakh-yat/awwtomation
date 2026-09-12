import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TopAutomation } from "@/lib/services/analytics";
import { formatNumber, formatPercent } from "@/lib/utils";

import { AUTOMATION_STATUS_LABELS, contactHandle } from "./labels";

function statusVariant(status: TopAutomation["status"]): "success" | "warning" | "outline" {
  if (status === "ACTIVE") return "success";
  if (status === "PAUSED") return "warning";
  return "outline";
}

export function TopAutomations({ automations }: { automations: TopAutomation[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Top automations</CardTitle>
          <CardDescription>Ranked by DMs sent in this period</CardDescription>
        </div>
        <Link href="/automations" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {automations.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <p className="text-sm font-medium">No DMs sent yet</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
              Automations appear here once they start sending. Create one to turn comments into DMs.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link href="/automations/new">
                <Plus />
                Create automation
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Automation</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="pr-5 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-[220px] pl-5">
                    <Link href={`/automations/${a.id}`} className="block truncate font-medium hover:underline" title={a.name}>
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <PlatformIcon platform={a.channel.platform} size={13} />
                      <span className="truncate">{contactHandle(a.channel.username, a.channel.name)}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(a.sent)}</TableCell>
                  <TableCell className="text-right tabular-nums" title={`${formatNumber(a.clicks)} clicks`}>
                    {formatPercent(a.ctr)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Badge variant={statusVariant(a.status)}>{AUTOMATION_STATUS_LABELS[a.status]}</Badge>
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
