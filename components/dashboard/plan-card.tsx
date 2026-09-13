import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuotaResult, OrganizationUsage } from "@/lib/billing/usage";
import { projectUsage } from "@/lib/services/usage-history";
import { cn, formatNumber } from "@/lib/utils";

function shortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function LimitRow({ label, quota }: { label: string; quota: QuotaResult }) {
  const full = quota.limit > 0 && quota.used >= quota.limit;
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", full && "font-medium")}>
        {formatNumber(quota.used)}
        <span className="text-muted-foreground"> of {formatNumber(quota.limit)}</span>
      </dd>
    </div>
  );
}

export function PlanCard({ usage, canManageBilling }: { usage: OrganizationUsage; canManageBilling: boolean }) {
  const { used, limit } = usage.dms;
  const share = limit > 0 ? Math.min(used / limit, 1) : 1;
  const projection = projectUsage({ used, limit, periodStart: usage.periodStart, periodEnd: usage.periodEnd });
  const near = share >= 0.8;
  // Three days is the least that makes a pace worth quoting.
  const pace =
    projection.daysElapsed >= 3 && used > 0
      ? projection.overLimit
        ? `At this pace you'll reach the limit around ${shortDate(projection.exhaustsAt ?? usage.periodEnd)}.`
        : `At this pace, about ${formatNumber(projection.projected)} by the end of the month.`
      : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Plan usage</CardTitle>
        <Badge variant="outline">{usage.limits.label}</Badge>
      </CardHeader>
      <div className="px-5 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            <span className="text-[22px] font-semibold tracking-tight text-foreground">{formatNumber(used)}</span> of {formatNumber(limit)} DMs
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">Resets {shortDate(usage.periodEnd)}</span>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="DMs used this month"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
        >
          <div className={cn("h-full rounded-full", near ? "bg-warning" : "bg-foreground")} style={{ width: `${Math.max(share * 100, used > 0 ? 1 : 0)}%` }} />
        </div>
        {pace ? <p className="mt-2.5 text-xs text-muted-foreground">{pace}</p> : null}
      </div>
      <dl className="mx-5 divide-y border-t text-[13px]">
        <LimitRow label="Accounts" quota={usage.channels} />
        <LimitRow label="Automations" quota={usage.automations} />
        <LimitRow label="Team seats" quota={usage.members} />
      </dl>
      <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-3 text-xs">
        <Link href="/usage" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Usage details
        </Link>
        {canManageBilling ? (
          <Link href="/settings/billing" className="font-medium underline-offset-4 hover:underline">
            {near ? "Upgrade plan" : "Manage plan"}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
