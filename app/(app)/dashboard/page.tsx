import type { Metadata } from "next";

import { MetricTabs, type MetricTab } from "@/components/charts/metric-tabs";
import { withPrevious } from "@/components/charts/series";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { GettingStarted } from "@/components/dashboard/getting-started";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { PlanCard } from "@/components/dashboard/plan-card";
import { RecentConversations } from "@/components/dashboard/recent-conversations";
import { TopAutomations } from "@/components/dashboard/top-automations";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getAnalyticsFilterOptions, getOverview, parseAnalyticsPeriod } from "@/lib/services/analytics";
import { getAttentionItems, getRecentConversations } from "@/lib/services/dashboard";
import { formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageBilling } from "@/lib/workspace/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;
  const days = parseAnalyticsPeriod(first(params.days));

  // An unknown `?channel=` is dropped quietly rather than failing the page.
  const { channels } = await getAnalyticsFilterOptions(ctx.workspace.id);
  const requestedChannel = first(params.channel);
  const channel = requestedChannel ? channels.find((c) => c.id === requestedChannel) : undefined;

  const overview = await getOverview(ctx.workspace.id, { days, channelId: channel?.id, timezone: ctx.workspace.timezone });

  if (channels.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description="Connect an Instagram or Facebook account to start replying to comments automatically." />
        <div className="max-w-2xl">
          <GettingStarted setup={overview.setup} />
        </div>
      </>
    );
  }

  const [attention, conversations] = await Promise.all([
    getAttentionItems({
      workspace: ctx.workspace,
      organization: ctx.organization,
      role: ctx.role,
      usage: overview.usage,
      failed: overview.totals.failed,
      skipReasons: overview.skipReasons,
      days,
    }),
    getRecentConversations(ctx.workspace.id, ctx.user.id),
  ]);

  const { totals, deltas, series, previousSeries } = overview;
  const metrics: MetricTab[] = [
    { key: "sent", label: "DMs sent", value: formatNumber(totals.dmsSent), delta: deltas.dmsSent, data: withPrevious(series, previousSeries, (p) => p.sent) },
    {
      key: "runs",
      label: "Automation runs",
      value: formatNumber(totals.triggered),
      delta: deltas.triggered,
      data: withPrevious(series, previousSeries, (p) => p.triggered),
    },
    { key: "clicks", label: "Link clicks", value: formatNumber(totals.linkClicks), delta: deltas.linkClicks, data: withPrevious(series, previousSeries, (p) => p.clicks) },
    {
      key: "contacts",
      label: "New contacts",
      value: formatNumber(totals.newContacts),
      delta: deltas.newContacts,
      data: withPrevious(series, previousSeries, (p) => p.newContacts),
    },
  ];

  const scope = channel ? (channel.username ? `@${channel.username.replace(/^@/, "")}` : (channel.name ?? "One account")) : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${scope ? `${scope} · ` : ""}Last ${days} days, compared with the ${days} days before.`}
        actions={<PeriodControls days={days} channelId={channel?.id ?? null} channels={channels} />}
      />

      <div className="space-y-6">
        {overview.setup.hasSentDm ? null : <GettingStarted setup={overview.setup} />}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="overflow-hidden xl:col-span-2">
            <MetricTabs metrics={metrics} fill />
          </Card>
          <div className="space-y-6">
            <AttentionCard items={attention} />
            <PlanCard usage={overview.usage} canManageBilling={canManageBilling(ctx.role)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <TopAutomations automations={overview.topAutomations} days={days} showAccount={channels.length > 1} className="xl:col-span-2" />
          <RecentConversations data={conversations} />
        </div>
      </div>
    </>
  );
}
