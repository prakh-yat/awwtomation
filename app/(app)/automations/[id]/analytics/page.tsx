import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { TriggerType } from "@prisma/client";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Pencil } from "lucide-react";

import { AnalyticsFrame } from "@/components/analytics/analytics-filters";
import { CardLink } from "@/components/analytics/card-link";
import { KpiStrip } from "@/components/analytics/kpi-strip";
import { DATE_KEY, formatRate, minusDays, todayIn } from "@/components/analytics/range";
import { AutomationStatusBadge } from "@/components/automations/badges";
import { BarList } from "@/components/charts/bar-list";
import { FunnelChart } from "@/components/charts/funnel";
import { Heatmap } from "@/components/charts/heatmap";
import { MetricTabs, type MetricTab } from "@/components/charts/metric-tabs";
import { withPrevious } from "@/components/charts/series";
import { stagger } from "@/components/charts/stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformMark } from "@/components/ui/platform-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryReason } from "@/lib/errors/customer-messages";
import { getAnalytics } from "@/lib/services/analytics";
import { getAutomation, listRecentDeliveries, type RecentDelivery } from "@/lib/services/automations";
import { cn, formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PRESET_DAYS = new Set(["7", "30", "90"]);
/** Keywords past this many collapse into a count, so the line stays one line. */
const KEYWORDS_SHOWN = 6;

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

const TRIGGER_NOUN: Record<TriggerType, { one: string; many: string }> = {
  COMMENT: { one: "comment", many: "Comments" },
  DM: { one: "DM", many: "DMs" },
  STORY_REPLY: { one: "story reply", many: "Story replies" },
};

function Outcome({ delivery }: { delivery: RecentDelivery }) {
  if (delivery.status === "SENT") {
    return (
      <Badge variant="success" dot>
        Sent
      </Badge>
    );
  }
  if (delivery.status === "FAILED") {
    return (
      <Badge variant="destructive" dot>
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" dot>
      Not sent
    </Badge>
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
  const noun = TRIGGER_NOUN[automation.triggerType];
  const hiddenKeywords = automation.keywords.length - KEYWORDS_SHOWN;
  const rangeLabel = `${format(parseISO(report.range.from), "MMM d")} – ${format(parseISO(report.range.to), "MMM d")}`;

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
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/automations/${automation.id}`}>
              <Pencil />
              Edit automation
            </Link>
          </Button>
        }
      />

      {/* What this report is of. It used to sit in the page description, which
          only the dashboard carries now. */}
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <PlatformMark platform={automation.channel.platform} size={18} />
          {account}
        </span>
        <span aria-hidden>·</span>
        {automation.matchMode === "ANY" ? (
          <span>Every {noun.one}</span>
        ) : automation.keywords.length === 0 ? (
          <span>No keywords yet</span>
        ) : (
          <>
            <span>{noun.many} matching</span>
            {automation.keywords.slice(0, KEYWORDS_SHOWN).map((keyword, i) => (
              <Badge key={`${i}-${keyword}`} variant="secondary" className="font-medium">
                {keyword}
              </Badge>
            ))}
            {hiddenKeywords > 0 ? <span className="text-xs">+{hiddenKeywords} more</span> : null}
          </>
        )}
      </div>

      <AnalyticsFrame rangeLabel={rangeLabel} today={today}>
        <div className="space-y-6">
          <KpiStrip items={metrics} highlight="sent" tone="purple" />

          <Card className="overflow-hidden">
            <MetricTabs metrics={metrics} initialKey="sent" height={260} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>From trigger to lead</CardTitle>
              </CardHeader>
              <CardContent>
                <FunnelChart steps={report.funnel.steps} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Why DMs weren&apos;t sent</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={skipItems} valueLabel="messages" emptyLabel="Every DM in this range went out" />
              </CardContent>
            </Card>
          </div>

          <div className={cn("grid grid-cols-1 gap-6", keywordItems.length > 0 && "lg:grid-cols-[1.6fr_1fr]")}>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Busiest times</CardTitle>
              </CardHeader>
              <CardContent>
                <Heatmap grid={report.heatmap} unit="run" timezone={timezone} />
              </CardContent>
            </Card>
            {keywordItems.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Keywords</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList items={keywordItems} valueLabel="runs" />
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Latest messages</CardTitle>
              <CardLink href={`/logs?automationId=${encodeURIComponent(automation.id)}`}>Open Logs</CardLink>
            </CardHeader>
            {recent.length === 0 ? (
              <p className="border-t px-5 py-8 text-[13px] text-muted-foreground">Nothing sent yet.</p>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Contact</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="min-w-[240px]">Message</TableHead>
                      <TableHead className="pr-5 text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((d, i) => {
                      const who = d.contactUsername ? `@${d.contactUsername}` : (d.contactName ?? "Unknown contact");
                      const text = d.status === "SENT" ? d.messagePreview : (d.reason ?? d.messagePreview);
                      return (
                        <TableRow key={d.id} className="rise" style={stagger(i)}>
                          <TableCell className="whitespace-nowrap pl-5">
                            {d.contactId ? (
                              <Link href={`/contacts/${d.contactId}`} className="font-semibold underline-offset-4 hover:underline">
                                {who}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{who}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Outcome delivery={d} />
                          </TableCell>
                          <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{KIND_LABEL[d.kind]}</TableCell>
                          <TableCell>
                            <p className={cn("max-w-[420px] truncate", d.status !== "SENT" && "text-muted-foreground")} title={text ?? undefined}>
                              {text ?? "–"}
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
