import type { Metadata } from "next";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Download, Workflow } from "lucide-react";

import { AnalyticsFrame, type FilterChannel } from "@/components/analytics/analytics-filters";
import { PipelineBreakdownCard } from "@/components/analytics/pipeline-breakdown";
import { BarList } from "@/components/charts/bar-list";
import { MetricTabs, type MetricTab } from "@/components/charts/metric-tabs";
import { withPrevious } from "@/components/charts/series";
import { FunnelChart } from "@/components/charts/funnel";
import { Heatmap } from "@/components/charts/heatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryReason } from "@/lib/errors/customer-messages";
import { getAnalytics, getAnalyticsFilterOptions } from "@/lib/services/analytics";
import { formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PRESET_DAYS = new Set(["7", "30", "90"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Today's YYYY-MM-DD in the workspace's time zone. */
function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function minusDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function minutes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "Under a minute";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = value / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;
  const timezone = ctx.workspace.timezone;
  const today = todayIn(timezone);

  const fromParam = one(params.from);
  const toParam = one(params.to);
  const daysParam = one(params.days);
  const custom = Boolean(fromParam && toParam && DATE_KEY.test(fromParam) && DATE_KEY.test(toParam));
  const days = daysParam && PRESET_DAYS.has(daysParam) ? Number(daysParam) : 30;
  const from = custom ? fromParam : minusDays(today, days - 1);
  const to = custom ? toParam : today;

  const [report, options] = await Promise.all([
    getAnalytics(ctx.workspace.id, {
      from,
      to,
      channelId: one(params.channelId),
      automationId: one(params.automationId),
      timezone,
    }),
    getAnalyticsFilterOptions(ctx.workspace.id),
  ]);

  const channels: FilterChannel[] = options.channels.map((c) => ({
    id: c.id,
    platform: c.platform,
    label: c.username ? `@${c.username}` : (c.name ?? "Account"),
  }));
  const automations = options.automations.map((a) => ({ id: a.id, name: a.name, channelId: a.channelId }));

  const rangeLabel = `${format(parseISO(report.range.from), "MMM d")} – ${format(parseISO(report.range.to), "MMM d")}`;
  const compareHint = `vs ${format(parseISO(report.range.previousFrom), "MMM d")} – ${format(parseISO(report.range.previousTo), "MMM d")}`;

  const exportQuery = new URLSearchParams({ from: report.range.from, to: report.range.to });
  if (report.filters.channelId) exportQuery.set("channelId", report.filters.channelId);
  if (report.filters.automationId) exportQuery.set("automationId", report.filters.automationId);

  const header = (
    <PageHeader
      title="Analytics"
      description="How comments turn into conversations, clicks and customers."
    />
  );

  if (!report.hasAnyData) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Workflow}
          title="Nothing to measure yet"
          description={
            channels.length === 0
              ? "Connect an Instagram or Facebook account first. Numbers appear here once an automation replies to its first comment or message."
              : "Numbers appear here once an automation replies to its first comment or message."
          }
          action={
            <Button asChild>
              {channels.length === 0 ? <Link href="/channels">Connect an account</Link> : <Link href="/automations">Go to automations</Link>}
            </Button>
          }
        />
      </div>
    );
  }

  const { totals, deltas, series, previousSeries } = report;
  const metrics: MetricTab[] = [
    { key: "runs", label: "Automation runs", value: formatNumber(totals.comments), delta: deltas.comments, data: withPrevious(series, previousSeries, (p) => p.comments) },
    { key: "sent", label: "DMs sent", value: formatNumber(totals.dmsSent), delta: deltas.dmsSent, data: withPrevious(series, previousSeries, (p) => p.dmsSent) },
    { key: "clicks", label: "Link clicks", value: formatNumber(totals.clicks), delta: deltas.clicks, data: withPrevious(series, previousSeries, (p) => p.clicks) },
    {
      key: "ctr",
      label: "Click rate",
      value: pct(totals.ctr),
      delta: deltas.ctr,
      kind: "percent",
      data: withPrevious(series, previousSeries, (p) => (p.dmsSent > 0 ? p.clicks / p.dmsSent : 0)),
    },
    {
      key: "contacts",
      label: "New contacts",
      value: formatNumber(totals.newContacts),
      delta: deltas.newContacts,
      data: withPrevious(series, previousSeries, (p) => p.newContacts),
    },
    { key: "leads", label: "New leads", value: formatNumber(totals.leads), delta: deltas.leads, data: withPrevious(series, previousSeries, (p) => p.leads) },
  ];
  const skipItems = report.skipReasons
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((s) => ({ key: s.status, label: deliveryReason(s.status).label, value: s.count }));
  const keywordItems = report.topKeywords.slice(0, 8).map((k) => ({ key: k.keyword, label: k.keyword, value: k.count }));
  const pipelineHref = (pipelineId: string) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = one(value);
      if (v && key !== "pipeline") query.set(key, v);
    }
    query.set("pipeline", pipelineId);
    return `/analytics?${query.toString()}`;
  };

  return (
    <div>
      {header}
      <AnalyticsFrame
        channels={channels}
        automations={automations}
        rangeLabel={rangeLabel}
        compareLabel={compareHint}
        today={today}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/api/analytics/export.csv?${exportQuery.toString()}`}>
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        }
      >
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <MetricTabs metrics={metrics} initialKey="sent" height={280} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>From comment to lead</CardTitle>
                <CardDescription>Each step as a share of the one before it.</CardDescription>
              </CardHeader>
              <CardContent>
                <FunnelChart steps={report.funnel.steps} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inbox</CardTitle>
                <CardDescription>Conversations your team handled by hand.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <div>
                    <dt className="text-xs text-muted-foreground">First reply, median</dt>
                    <dd className="mt-1 text-xl font-semibold">{minutes(report.inbox.medianFirstResponseMinutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Messages received</dt>
                    <dd className="mt-1 text-xl font-semibold">{formatNumber(report.inbox.inboundMessages)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Replies by your team</dt>
                    <dd className="mt-1 text-xl font-semibold">{formatNumber(report.inbox.humanReplies)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Sent automatically</dt>
                    <dd className="mt-1 text-xl font-semibold">{pct(report.inbox.automatedShare)}</dd>
                  </div>
                </dl>
                <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
                  {report.inbox.answeredThreads > 0
                    ? `Based on ${formatNumber(report.inbox.answeredThreads)} conversation${report.inbox.answeredThreads === 1 ? "" : "s"} your team replied to.`
                    : "No conversations were answered by hand in this range."}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Automations</CardTitle>
              <CardDescription>Ranked by DMs sent in this range.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Automation</TableHead>
                    <TableHead className="hidden lg:table-cell">Account</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Runs</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Not sent</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Clicks</TableHead>
                    <TableHead className="pr-5 text-right">Click rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byAutomation.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-[13px] text-muted-foreground">
                        No automation ran in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.byAutomation.map((row) => (
                      <TableRow key={row.automation.id}>
                        <TableCell className="max-w-[260px] pl-5">
                          <div className="flex items-center gap-2">
                            <Link href={`/automations/${row.automation.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                              {row.automation.name}
                            </Link>
                            {row.automation.status !== "ACTIVE" ? (
                              <Badge variant="secondary">{row.automation.status === "PAUSED" ? "Paused" : "Draft"}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          <span className="inline-flex items-center gap-1.5">
                            <PlatformIcon platform={row.channel.platform} size={13} />
                            {row.channel.username ? `@${row.channel.username}` : row.channel.name}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.triggered)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatNumber(row.sent)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{formatNumber(row.failed)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.clicks)}</TableCell>
                        <TableCell className="pr-5 text-right tabular-nums">{pct(row.ctr)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {report.byChannel.length > 1 ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>How each connected account compares.</CardDescription>
              </CardHeader>
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Account</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Runs</TableHead>
                      <TableHead className="text-right">DMs sent</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Clicks</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Click rate</TableHead>
                      <TableHead className="pr-5 text-right">New contacts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byChannel.map((row) => (
                      <TableRow key={row.channel.id}>
                        <TableCell className="pl-5 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <PlatformIcon platform={row.channel.platform} size={14} className="text-muted-foreground" />
                            {row.channel.username ? `@${row.channel.username}` : row.channel.name}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.comments)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(row.dmsSent)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.clicks)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{pct(row.ctr)}</TableCell>
                        <TableCell className="pr-5 text-right tabular-nums">{formatNumber(row.newContacts)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Busiest times</CardTitle>
                <CardDescription>When your automations run, by day and hour.</CardDescription>
              </CardHeader>
              <CardContent>
                <Heatmap grid={report.heatmap} unit="run" timezone={timezone} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top keywords</CardTitle>
                <CardDescription>The keywords that started the most automation runs.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList items={keywordItems} valueLabel="runs" emptyLabel="No keyword matches in this range" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PipelineBreakdownCard pipelines={report.pipelines} selectedId={one(params.pipeline) ?? null} hrefFor={pipelineHref} />
            <Card>
              <CardHeader>
                <CardTitle>Why DMs weren&apos;t sent</CardTitle>
                <CardDescription>Held back by Instagram rules or your own settings, or refused by Instagram.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList items={skipItems} valueLabel="messages" emptyLabel="Every DM in this range went out" />
                {skipItems.length > 0 ? (
                  <p className="mt-4 text-xs text-muted-foreground">
                    See individual messages in{" "}
                    <Link href="/logs" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
                      Logs
                    </Link>
                    .
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </AnalyticsFrame>
    </div>
  );
}
