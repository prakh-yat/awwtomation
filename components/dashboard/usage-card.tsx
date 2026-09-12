import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuotaResult, WorkspaceUsage } from "@/lib/billing/usage";
import { cn, formatNumber } from "@/lib/utils";

/** Above this share of any limit we surface the upgrade link. */
const UPGRADE_THRESHOLD = 0.8;

function share(q: QuotaResult): number {
  return q.limit === 0 ? 1 : Math.min(q.used / q.limit, 1);
}

function UsageRow({ label, quota, bar }: { label: string; quota: QuotaResult; bar?: boolean }) {
  const pct = share(quota);
  const hot = pct >= UPGRADE_THRESHOLD;
  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular-nums", hot ? "font-medium text-foreground" : "text-foreground")}>
          {formatNumber(quota.used)} <span className="text-muted-foreground">/ {formatNumber(quota.limit)}</span>
        </span>
      </div>
      {bar ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.used}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function UsageCard({ usage }: { usage: WorkspaceUsage }) {
  const needsUpgrade = [usage.dms, usage.channels, usage.automations].some((q) => share(q) >= UPGRADE_THRESHOLD);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Plan usage</CardTitle>
          <CardDescription>Resets {format(usage.periodEnd, "MMM d")}</CardDescription>
        </div>
        <Badge variant="outline">{usage.limits.label}</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <UsageRow label="DMs this month" quota={usage.dms} bar />
        <UsageRow label="Channels" quota={usage.channels} />
        <UsageRow label="Automations" quota={usage.automations} />
        <div className="mt-auto flex items-center justify-between border-t pt-4">
          {needsUpgrade ? (
            <>
              <Badge variant="warning">Approaching limit</Badge>
              <Button asChild size="sm">
                <Link href="/settings/billing">
                  Upgrade
                  <ArrowUpRight />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Plenty of headroom.</p>
              <Link href="/settings/billing" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Manage plan
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
