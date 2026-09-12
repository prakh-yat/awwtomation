import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Activity, MousePointerClick, Percent, Send, XCircle } from "lucide-react";

import { AnalyticsChart } from "@/components/automations/analytics-chart";
import { AutomationStatusBadge, TriggerBadge } from "@/components/automations/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brand } from "@/lib/brand";
import { deliveryStatusLabel, getAutomation, getAutomationAnalytics, type RecentDelivery } from "@/lib/services/automations";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RANGES = [7, 30, 90] as const;

// generateMetadata and the page both need the automation; cache dedupes the query per request.
const loadAutomation = cache((workspaceId: string, id: string) => getAutomation(workspaceId, id));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const automation = await loadAutomation(ctx.workspace.id, id);
  return { title: `${automation?.name ?? "Automation"} analytics · ${brand.name}` };
}

function statusVariant(status: RecentDelivery["status"]): "success" | "destructive" | "warning" | "secondary" {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "destructive";
  if (status === "SKIPPED_RATE_LIMIT" || status === "SKIPPED_PLAN_LIMIT") return "warning";
  return "secondary";
}

const KIND_LABELS: Record<RecentDelivery["kind"], string> = {
  PRIVATE_REPLY: "Private reply",
  MESSAGE: "Message",
  PUBLIC_REPLY: "Public reply",
  BROADCAST: "Broadcast",
};

export default async function AutomationAnalyticsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const sp = await searchParams;
  const daysRaw = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = RANGES.includes(daysRaw as (typeof RANGES)[number]) ? daysRaw : 30;

  const automation = await loadAutomation(ctx.workspace.id, id);
  if (!automation) notFound();
  const analytics = await getAutomationAnalytics(ctx.workspace.id, id, days);
  const { totals } = analytics;
  const hasData = totals.triggered + totals.sent + totals.failed + totals.clicks > 0;

  return (
    <>
      <PageHeader
        title={automation.name}
        description={`On ${automation.channel.username ? `@${automation.channel.username}` : automation.channel.name} · last ${days} days · ${analytics.timezone}`}
        backHref="/automations"
        backLabel="Automations"
        actions={
          <>
            <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground">
              {RANGES.map((r) => (
                <Link
                  key={r}
                  href={`/automations/${automation.id}/analytics?days=${r}`}
                  className={cn(
                    "inline-flex h-full items-center rounded-md px-3 text-[13px] font-medium transition-all",
                    r === days ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
                  )}
                >
                  {r}d
                </Link>
              ))}
            </div>
            <Button asChild variant="outline">
              <Link href={`/automations/${automation.id}`}>Open builder</Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AutomationStatusBadge status={automation.status} />
        <TriggerBadge trigger={automation.triggerType} />
        {automation.matchMode === "ANY" ? (
          <span className="text-[12px] text-muted-foreground">Fires on every comment</span>
        ) : automation.keywords.length > 0 ? (
          <span className="text-[12px] text-muted-foreground">Keywords: {automation.keywords.join(", ")}</span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Triggered" value={formatNumber(totals.triggered)} icon={Activity} hint="Flows started" />
        <StatCard label="DMs sent" value={formatNumber(totals.sent)} icon={Send} hint={`${formatNumber(totals.publicReplies)} public replies`} />
        <StatCard label="Failed / skipped" value={formatNumber(totals.failed)} icon={XCircle} hint="See reasons below" />
        <StatCard label="Link clicks" value={formatNumber(totals.clicks)} icon={MousePointerClick} hint="Tracked links only" />
        <StatCard label="CTR" value={totals.ctr === null ? "—" : formatPercent(totals.ctr)} icon={Percent} hint="Clicks ÷ DMs sent" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Daily activity</CardTitle>
          <CardDescription>Triggers, DMs, clicks and skips per day in the workspace timezone.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <AnalyticsChart series={analytics.series} />
          ) : (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description={
                automation.status === "ACTIVE"
                  ? "Numbers show up here as soon as someone triggers the automation."
                  : "Activate the automation to start collecting data."
              }
              className="py-10"
            />
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Skip reasons</CardTitle>
            <CardDescription>Why a DM wasn&apos;t sent, last {days} days.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {analytics.skipReasons.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">Nothing skipped. Nice.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Reason</TableHead>
                    <TableHead className="pr-5 text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.skipReasons.map((r) => (
                    <TableRow key={r.status}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusVariant(r.status)}>{r.label}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="pr-5 text-right tabular-nums">{formatNumber(r.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent deliveries</CardTitle>
            <CardDescription>The last 20 attempts, newest first.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {analytics.recentDeliveries.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">No deliveries yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="min-w-[200px]">Message</TableHead>
                    <TableHead className="pr-5 text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.recentDeliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="pl-5">
                        {d.contactId ? (
                          <Link href={`/contacts/${d.contactId}`} className="font-medium hover:underline underline-offset-2">
                            {d.contactUsername ? `@${d.contactUsername}` : (d.contactName ?? "Unknown")}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{d.contactUsername ? `@${d.contactUsername}` : "Unknown"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(d.status)}>{deliveryStatusLabel(d.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{KIND_LABELS[d.kind]}</TableCell>
                      <TableCell>
                        <p className="max-w-[320px] truncate" title={d.errorMessage ?? d.messagePreview ?? undefined}>
                          {d.status === "SENT" ? d.messagePreview : (d.errorMessage ?? d.messagePreview ?? "—")}
                        </p>
                      </TableCell>
                      <TableCell className="pr-5 text-right text-[12px] text-muted-foreground" title={format(new Date(d.createdAt), "PPpp")}>
                        {formatDistanceToNowStrict(new Date(d.createdAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
