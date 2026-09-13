import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Pencil } from "lucide-react";

import { AnalyticsFrame } from "@/components/analytics/analytics-filters";
import { DATE_KEY, formatRate, minusDays, todayIn } from "@/components/analytics/range";
import { AutomationStatusBadge } from "@/components/automations/badges";
import { BarList } from "@/components/charts/bar-list";
import { FunnelChart } from "@/components/charts/funnel";
import { Heatmap } from "@/components/charts/heatmap";
import { MetricTabs, type MetricTab } from "@/components/charts/metric-tabs";
import { withPrevious } from "@/components/charts/series";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryReason } from "@/lib/errors/customer-messages";
import { getAnalytics } from "@/lib/services/analytics";
import { getAutomation, listRecentDeliveries, type RecentDelivery } from "@/lib/services/automations";
import { cn, formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PRESET_DAYS = new Set(["7", "30", "90"]);

// generateMetadata and the page both need the automation; cache dedupes the query per request.
const loadAutomation = cache((workspaceId: string, id: string) => getAutomation(workspaceId, id));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const automation = await loadAutomation(ctx.workspace.id, id);
  return { title: automation ? `${automation.name} report` : "Automation report" };
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const KIND_LABEL: Record<RecentDelivery["kind"], string> = {
  PRIVATE_REPLY: "DM",
  MESSAGE: "DM",
  PUBLIC_REPLY: "Comment reply",
  BROADCAST: "Broadcast",
};

function Outcome({ delivery }: { delivery: RecentDelivery }) {
  const sent = delivery.status === "SENT";
  const failed = delivery.status === "FAILED";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("h-1.5 w-1.5 rounded-full", sent ? "bg-success" : failed ? "bg-destructive" : "bg-muted-foreground/50")} aria-hidden />
      {sent ? "Sent" : failed ? "Failed" : "Not sent"}
    </span>
  );
}

export default async function AutomationReportPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const sp = await searchParams;

  const automation = await loadAutomation(ctx.workspace.id, id);
  if (!automation) notFound();

  const timezone = ctx.workspace.timezone;
  const today = todayIn(timezone);
  const fromParam = one(sp.from);
  const toParam = one(sp.to);
  const daysParam = one(sp.days);
  const custom = Boolean(fromParam && toParam && DATE_KEY.test(fromParam) && DATE_KEY.test(toParam));
  const days = daysParam && PRESET_DAYS.has(daysParam) ? Number(daysParam) : 30;

  const [report, recent] = await Promise.all([
    getAnalytics(ctx.workspace.id, {
      from: custom ? fromParam : minusDays(today, days - 1),
      to: custom ? toParam : today,
      automationId: automation.id,
      timezone,
    }),
    listRecentDeliveries(ctx.workspace.id, automation.id, 20),
  ]);

  const { totals, deltas, series, previousSeries } = report;
  const metrics: MetricTab[] = [
    { key: "runs", label: "Runs", value: formatNumber(totals.comments), delta: deltas.comments, data: withPrevious(series, previousSeries, (p) => p.comments) },
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
    { key: "leads", label: "New leads", value: formatNumber(totals.leads), delta: deltas.leads, data: withPrevious(series, previousSeries, (p) => p.leads) },
  ];

  const skipItems = report.skipReasons
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((s) => ({ key: s.status, label: deliveryReason(s.status).label, value: s.count }));
  const keywordItems = report.topKeywords.slice(0, 8).map((k) => ({ key: k.keyword, label: k.keyword, value: k.count }));

  const account = automation.channel.username ? `@${automation.channel.username}` : (automation.channel.name ?? "Your account");
  const trigger =
    automation.triggerType === "COMMENT" ? "Comments" : automation.triggerType === "DM" ? "DMs" : "Story replies";
  const matching = automation.matchMode === "ANY" ? "every message" : automation.keywords.length ? automation.keywords.join(", ") : "no keywords yet";
  const rangeLabel = `${format(parseISO(report.range.from), "MMM d")} – ${format(parseISO(report.range.to), "MMM d")}`;
  const compareLabel = `vs ${format(parseISO(report.range.previousFrom), "MMM d")} – ${format(parseISO(report.range.previousTo), "MMM d")}`;

  return (
    <>
      <PageHeader
        backHref="/automations"
        backLabel="Automations"
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {automation.name}
            <AutomationStatusBadge status={automation.status} />
          </span>
        }
        description={`${account} · ${trigger} matching ${matching}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/automations/${automation.id}`}>
              <Pencil />
              Edit automation
            </Link>
          </Button>
        }
      />

      <AnalyticsFrame rangeLabel={rangeLabel} compareLabel={compareLabel} today={today}>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <MetricTabs metrics={metrics} initialKey="sent" height={260} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>From trigger to lead</CardTitle>
                <CardDescription>People at each step, as a share of the step before.</CardDescription>
              </CardHeader>
              <CardContent>
                <FunnelChart steps={report.funnel.steps} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Why DMs weren&apos;t sent</CardTitle>
                <CardDescription>Held back by Instagram rules or your own settings, or refused by Instagram.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList items={skipItems} valueLabel="messages" emptyLabel="Every DM in this range went out" />
              </CardContent>
            </Card>
          </div>

          <div className={cn("grid grid-cols-1 gap-6", keywordItems.length > 0 && "lg:grid-cols-[1.6fr_1fr]")}>
            <Card>
              <CardHeader>
                <CardTitle>Busiest times</CardTitle>
                <CardDescription>When this automation runs, by day and hour.</CardDescription>
              </CardHeader>
              <CardContent>
                <Heatmap grid={report.heatmap} unit="run" timezone={timezone} />
              </CardContent>
            </Card>
            {keywordItems.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Keywords</CardTitle>
                  <CardDescription>Which words started the most runs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <BarList items={keywordItems} valueLabel="runs" />
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle>Latest messages</CardTitle>
                <CardDescription>The 20 most recent, newest first.</CardDescription>
              </div>
              <Link
                href={`/logs?automationId=${encodeURIComponent(automation.id)}`}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                See all in Logs
              </Link>
            </CardHeader>
            {recent.length === 0 ? (
              <p className="border-t px-5 py-8 text-[13px] text-muted-foreground">Nothing sent yet. Messages show up here the first time the automation runs.</p>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Contact</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="min-w-[260px]">Message</TableHead>
                      <TableHead className="pr-5 text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((d) => {
                      const who = d.contactUsername ? `@${d.contactUsername}` : (d.contactName ?? "Unknown contact");
                      const text = d.status === "SENT" ? d.messagePreview : (d.reason ?? d.messagePreview);
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="whitespace-nowrap pl-5">
                            {d.contactId ? (
                              <Link href={`/contacts/${d.contactId}`} className="font-medium underline-offset-4 hover:underline">
                                {who}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{who}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Outcome delivery={d} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{KIND_LABEL[d.kind]}</TableCell>
                          <TableCell>
                            <p className={cn("max-w-[420px] truncate", d.status !== "SENT" && "text-muted-foreground")} title={text ?? undefined}>
                              {text ?? "—"}
                            </p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap pr-5 text-right text-muted-foreground" title={format(new Date(d.createdAt), "PPpp")}>
                            {formatDistanceToNowStrict(new Date(d.createdAt), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      </AnalyticsFrame>
    </>
  );
}
