import type { Metadata } from "next";
import { Suspense } from "react";

import { KpiStrip } from "@/components/analytics/kpi-strip";
import { AccountsBar } from "@/components/channels/accounts-bar";
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
import { effectivePlan, historyPlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { checkLimit } from "@/lib/billing/usage";
import { isMetaConfigured } from "@/lib/env";
import { clampPeriod, getAnalyticsFilterOptions, getOverview, parseAnalyticsPeriod, periodsWithin } from "@/lib/services/analytics";
import { listChannels, toChannelView } from "@/lib/services/channels";
import { getAttentionItems, getRecentConversations } from "@/lib/services/dashboard";
import { formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageBilling, canManageChannels } from "@/lib/workspace/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * On a desktop the dashboard is one screen: the header, the numbers, then a
 * grid that takes whatever height is left, with each list scrolling inside its
 * own card. Below lg it is an ordinary page.
 */
const FIT = "flex flex-col lg:h-[calc(100dvh-3.5rem)] lg:min-h-[40rem]";

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;

  // A period longer than the plan's history would chart deleted days as zeros.
  const historyDays = limitsFor(historyPlan(ctx.organization)).historyDays;
  const days = clampPeriod(parseAnalyticsPeriod(first(params.days)), historyDays);

  const [{ channels }, summaries, slots] = await Promise.all([
    getAnalyticsFilterOptions(ctx.workspace.id),
    listChannels(ctx.workspace.id),
    checkLimit(ctx.workspace.id, "channels"),
  ]);
  // An unknown `?channel=` is dropped quietly rather than failing the page.
  const requestedChannel = first(params.channel);
  const channel = requestedChannel ? channels.find((c) => c.id === requestedChannel) : undefined;

  const overview = await getOverview(ctx.workspace.id, { days, channelId: channel?.id, timezone: ctx.workspace.timezone });

  const configured = isMetaConfigured();
  const canConnect = canManageChannels(ctx.role);
  const accounts = (
    // The bar reads its flags (`?accounts=1`, OAuth results) from the URL.
    <Suspense fallback={null}>
      <AccountsBar
        channels={summaries.map(toChannelView)}
        configured={configured}
        canManage={canConnect}
        canPurge={ctx.role === "OWNER"}
        slots={{ used: slots.used, limit: slots.limit }}
        planLabel={limitsFor(effectivePlan(ctx.organization)).label}
        canUpgrade={canManageBilling(ctx.role)}
      />
    </Suspense>
  );

  if (channels.length === 0) {
    return (
      <div className={FIT}>
        <PageHeader title="Dashboard" actions={accounts} className="mb-5" />
        <GettingStarted setup={overview.setup} configured={configured} canConnect={canConnect} className="lg:flex-1" />
      </div>
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
    getRecentConversations(ctx.workspace.id, ctx.user.id, 8),
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

  const setupPending = !overview.setup.hasSentDm;

  return (
    <div className={FIT}>
      <PageHeader
        title="Dashboard"
        className="mb-5"
        actions={
          <>
            {accounts}
            <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <PeriodControls days={days} periods={periodsWithin(historyDays)} channelId={channel?.id ?? null} channels={channels} />
          </>
        }
      />

      {/* One filled block per page: while the checklist is up, it is that block. */}
      <KpiStrip items={metrics} highlight={setupPending ? undefined : "sent"} tone="yellow" compact className="shrink-0" />

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-2">
          {setupPending ? <GettingStarted setup={overview.setup} configured={configured} canConnect={canConnect} compact /> : null}
          <Card className="flex min-h-[18rem] flex-col overflow-hidden lg:min-h-0 lg:flex-[3]">
            <MetricTabs metrics={metrics} fill height={220} />
          </Card>
          {setupPending ? null : (
            <TopAutomations automations={overview.topAutomations} days={days} showAccount={channels.length > 1} className="lg:min-h-0 lg:flex-[2]" />
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <AttentionCard items={attention} className="shrink-0" />
          <RecentConversations data={conversations} className="min-h-[16rem] lg:min-h-0 lg:flex-1" />
          <PlanCard usage={overview.usage} canManageBilling={canManageBilling(ctx.role)} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
