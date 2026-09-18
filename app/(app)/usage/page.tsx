import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";

import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getUsageHistory } from "@/lib/services/usage-history";
import { cn, formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageBilling } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

function utcDay(iso: string, pattern = "MMM d"): string {
  const d = new Date(iso);
  return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), pattern);
}

function shortMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMM");
}

export default async function UsagePage() {
  const ctx = await requireWorkspaceContext();
  const history = await getUsageHistory(ctx.organization.id, 6);
  const multipleWorkspaces = ctx.workspaces.length > 1;
  const period = history.currentPeriod;
  const canUpgrade = canManageBilling(ctx.role) && period.plan !== "AGENCY";

  const pct = Math.min(period.pct, 1);
  const tone = period.pct >= 1 ? "destructive" : period.pct >= 0.8 ? "warning" : "normal";
  // The last day of the period is the day before it resets.
  const periodEndLabel = utcDay(new Date(new Date(period.resetsAt).getTime() - 86_400_000).toISOString());

  const channelItems = period.perChannel.map((row) => ({
    key: row.channel.id,
    label: (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <PlatformIcon platform={row.channel.platform} size={13} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{row.channel.username ? `@${row.channel.username}` : (row.channel.name ?? "Account")}</span>
        {multipleWorkspaces ? <span className="truncate text-muted-foreground">· {row.workspace.name}</span> : null}
      </span>
    ),
    value: row.used,
  }));
  const workspaceItems = period.perWorkspace.map((row) => ({ key: row.id, label: row.name, value: row.used }));
  const automationItems = [
    ...period.perAutomation.map((row) => ({ key: row.id, label: row.name, value: row.used, href: `/automations/${row.id}` })),
    ...(period.broadcasts > 0 ? [{ key: "broadcasts", label: "Broadcasts", value: period.broadcasts, href: "/broadcasts" }] : []),
  ].sort((a, b) => b.value - a.value);

  const columns = history.months.map((m) => ({
    key: m.month,
    label: shortMonth(m.month),
    value: m.dmsSent,
  }));

  return (
    <div>
      <PageHeader
        title="Usage"
      />

      <div className="space-y-6">
        {history.warnings.map((w) => (
          <div
            key={w.message}
            role="status"
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-[13px]",
              w.level === "critical" ? "border-destructive/25 bg-destructive/5" : "border-warning/30 bg-warning/5",
            )}
          >
            <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", w.level === "critical" ? "text-destructive" : "text-warning")} />
            <p className="flex-1">{w.message}</p>
            {canUpgrade ? (
              <Link href="/settings/billing" className="shrink-0 font-medium underline underline-offset-4 hover:no-underline">
                Upgrade
              </Link>
            ) : null}
          </div>
        ))}

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">
                  {utcDay(period.periodStart)} – {periodEndLabel} · {period.planLabel} plan
                </p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-5xl font-semibold tracking-tight">{formatNumber(period.used)}</span>
                  <span className="text-sm text-muted-foreground">of {formatNumber(period.limit)} DMs</span>
                </p>
              </div>
              {canUpgrade ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings/billing">Change plan</Link>
                </Button>
              ) : null}
            </div>

            <div
              className="mt-5 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="DMs used this month"
              aria-valuemin={0}
              aria-valuemax={period.limit}
              aria-valuenow={Math.min(period.used, period.limit)}
            >
              <div
                className={cn("h-full rounded-full", tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-foreground")}
                style={{ width: `${Math.max(pct * 100, period.used > 0 ? 1 : 0)}%` }}
              />
            </div>

            <dl className="mt-5 grid gap-4 border-t pt-5 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Used</dt>
                <dd className="mt-0.5 font-medium">{Math.round(period.pct * 100)}% of your limit</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">At this pace</dt>
                <dd className="mt-0.5 font-medium">
                  About {formatNumber(period.projected)} by {periodEndLabel}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Resets</dt>
                <dd className="mt-0.5 font-medium">{utcDay(period.resetsAt, "EEEE, MMM d")}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className={cn("grid grid-cols-1 gap-6", multipleWorkspaces ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
          {multipleWorkspaces ? (
            <Card>
              <CardHeader>
                <CardTitle>By workspace</CardTitle>
                <CardDescription>Every workspace draws from the same monthly allowance.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList items={workspaceItems} valueLabel="DMs" emptyLabel="No DMs sent this month" />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>By account</CardTitle>
              <CardDescription>DMs sent this month from each connected account.</CardDescription>
            </CardHeader>
            <CardContent>
              <BarList items={channelItems} valueLabel="DMs" emptyLabel="No DMs sent this month" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By automation</CardTitle>
              <CardDescription>What sent the most this month.</CardDescription>
            </CardHeader>
            <CardContent>
              <BarList items={automationItems} valueLabel="DMs" emptyLabel="No DMs sent this month" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Last six months</CardTitle>
            <CardDescription>
              Monthly DMs against your current {formatNumber(period.limit)} limit. Earlier months may have been on a different plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ColumnChart data={columns} valueLabel="DMs sent" limit={period.limit} limitLabel="Plan limit" />
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">DMs sent</TableHead>
                    <TableHead className="text-right">From comments</TableHead>
                    <TableHead className="text-right">From DMs and stories</TableHead>
                    <TableHead className="text-right">Broadcasts</TableHead>
                    <TableHead className="text-right">Comment replies</TableHead>
                    <TableHead className="text-right">Of limit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...history.months].reverse().map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">
                        {m.label}
                        {m.isCurrent ? <span className="ml-2 text-xs font-normal text-muted-foreground">so far</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(m.dmsSent)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.privateReplies)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.messages)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.broadcasts)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.publicReplies)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", m.overagePct > 1 ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {Math.round(m.overagePct * 100)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Comment replies are posted under the comment, not sent as DMs, so they don&apos;t count toward your limit.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
