import type { Metadata } from "next";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { BarChart3, Download } from "lucide-react";

import { AnalyticsFrame, type FilterChannel } from "@/components/analytics/analytics-filters";
import { CardLink } from "@/components/analytics/card-link";
import { KpiStrip } from "@/components/analytics/kpi-strip";
import { PipelineBreakdownCard } from "@/components/analytics/pipeline-breakdown";
import { DATE_KEY, formatRate, minusDays, todayIn } from "@/components/analytics/range";
import { AutomationStatusBadge } from "@/components/automations/badges";
import { BarList } from "@/components/charts/bar-list";
import { FunnelChart } from "@/components/charts/funnel";
import { Heatmap } from "@/components/charts/heatmap";
import { MetricTabs, type MetricTab } from "@/components/charts/metric-tabs";
import { withPrevious } from "@/components/charts/series";
import { SplitBar } from "@/components/charts/split-bar";
import { stagger } from "@/components/charts/stagger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformMark } from "@/components/ui/platform-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryReason } from "@/lib/errors/customer-messages";
import { getAnalytics, getAnalyticsFilterOptions } from "@/lib/services/analytics";
import { formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PRESET_DAYS = new Set(["7", "30", "90"]);

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function minutes(value: number | null): string {
  if (value === null) return "–";
  if (value < 1) return "<1 min";
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

  const exportQuery = new URLSearchParams({ from: report.range.from, to: report.range.to });
  if (report.filters.channelId) exportQuery.set("channelId", report.filters.channelId);
  if (report.filters.automationId) exportQuery.set("automationId", report.filters.automationId);

  const header = <PageHeader title="Analytics" />;

  if (!report.hasAnyData) {
    return (
      <div>
        {header}
        <EmptyState
          icon={BarChart3}
          tone="blue"
          title="Nothing to measure yet"
          description={
            channels.length === 0 ? "Connect an account, then turn on an automation." : "Numbers show up after an automation's first reply."
          }
          action={
            channels.length === 0 ? (
              <Button asChild variant="highlight">
                <Link href="/dashboard?accounts=1">Connect account</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/automations">Open automations</Link>
              </Button>
            )
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
      value: formatRate(totals.ctr),
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
  const { inbox } = report;
  const outbound = inbox.automatedMessages + inbox.humanReplies;

  return (
    <div>
      {header}
      <AnalyticsFrame
        channels={channels}
        automations={automations}
        rangeLabel={rangeLabel}
        today={today}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/api/analytics/export.csv?${exportQuery.toString()}`}>
              <Download />
              Export CSV
            </a>
          </Button>
        }
      >
        <div className="space-y-6">
          <KpiStrip items={metrics} highlight="sent" tone="blue" />

          <Card className="overflow-hidden">
            <MetricTabs metrics={metrics} initialKey="sent" height={280} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>From comment to lead</CardTitle>
              </CardHeader>
              <CardContent>
                <FunnelChart steps={report.funnel.steps} />
              </CardContent>
            </Card>

            <section aria-labelledby="inbox-title" className="rounded-2xl bg-fog p-5">
              <h2 id="inbox-title" className="text-[15px] font-semibold leading-tight">
                Inbox
              </h2>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                <div className="min-w-0">
                  <dt className="brand-label text-muted-foreground">Median first reply</dt>
                  <dd className="font-display mt-2 truncate text-[26px] leading-none">{minutes(inbox.medianFirstResponseMinutes)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="brand-label text-muted-foreground">Messages received</dt>
                  <dd className="font-display mt-2 truncate text-[26px] leading-none">{formatNumber(inbox.inboundMessages)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="brand-label text-muted-foreground">Team replies</dt>
                  <dd className="font-display mt-2 truncate text-[26px] leading-none">{formatNumber(inbox.humanReplies)}</dd>
                </div>
              </dl>
              {outbound > 0 ? (
                <SplitBar
                  className="mt-6 border-t border-ink/10 pt-5"
                  label="Messages sent"
                  segments={[
                    { key: "automated", label: "Sent automatically", share: inbox.automatedShare },
                    { key: "team", label: "Sent by your team", share: 1 - inbox.automatedShare },
                  ]}
                />
              ) : null}
            </section>
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Automations</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
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
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-8 text-center text-[13px] text-muted-foreground">
                        No automation ran in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.byAutomation.map((row, i) => (
                      <TableRow key={row.automation.id} className="rise" style={stagger(i)}>
                        <TableCell className="max-w-[280px] pl-5">
                          <div className="flex min-w-0 items-center gap-2">
                            <Link href={`/automations/${row.automation.id}`} className="truncate font-semibold underline-offset-4 hover:underline">
                              {row.automation.name}
                            </Link>
                            {row.automation.status !== "ACTIVE" ? <AutomationStatusBadge status={row.automation.status} className="shrink-0" /> : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          <span className="inline-flex items-center gap-2">
                            <PlatformMark platform={row.channel.platform} size={16} />
                            {row.channel.username ? `@${row.channel.username}` : row.channel.name}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.triggered)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatNumber(row.sent)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{formatNumber(row.failed)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.clicks)}</TableCell>
                        <TableCell className="pr-5 text-right tabular-nums">{formatRate(row.ctr)}</TableCell>
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
              </CardHeader>
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Account</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Runs</TableHead>
                      <TableHead className="text-right">DMs sent</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Clicks</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Click rate</TableHead>
                      <TableHead className="pr-5 text-right">New contacts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byChannel.map((row, i) => (
                      <TableRow key={row.channel.id} className="rise" style={stagger(i)}>
                        <TableCell className="pl-5 font-semibold">
                          <span className="inline-flex items-center gap-2">
                            <PlatformMark platform={row.channel.platform} size={18} />
                            {row.channel.username ? `@${row.channel.username}` : row.channel.name}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.comments)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(row.dmsSent)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(row.clicks)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{formatRate(row.ctr)}</TableCell>
                        <TableCell className="pr-5 text-right tabular-nums">{formatNumber(row.newContacts)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Busiest times</CardTitle>
              </CardHeader>
              <CardContent>
                <Heatmap grid={report.heatmap} unit="run" timezone={timezone} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top keywords</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={keywordItems} valueLabel="runs" emptyLabel="No keyword matches in this range" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PipelineBreakdownCard pipelines={report.pipelines} selectedId={one(params.pipeline) ?? null} hrefFor={pipelineHref} />
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle>Why DMs weren&apos;t sent</CardTitle>
                {skipItems.length > 0 ? <CardLink href="/logs">Open Logs</CardLink> : null}
              </CardHeader>
              <CardContent>
                <BarList items={skipItems} valueLabel="messages" emptyLabel="Every DM in this range went out" />
              </CardContent>
            </Card>
          </div>
        </div>
      </AnalyticsFrame>
    </div>
  );
}
