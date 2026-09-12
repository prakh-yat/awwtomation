import type { Metadata } from "next";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ChannelBreakdown } from "@/components/dashboard/channel-breakdown";
import { GettingStarted } from "@/components/dashboard/getting-started";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { SkipReasons } from "@/components/dashboard/skip-reasons";
import { StatRow } from "@/components/dashboard/stat-row";
import { TopAutomations } from "@/components/dashboard/top-automations";
import { UsageCard } from "@/components/dashboard/usage-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { brand } from "@/lib/brand";
import { getChannelBreakdown, getOverview, parseAnalyticsPeriod } from "@/lib/services/analytics";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `Overview · ${brand.name}` };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;
  const days = parseAnalyticsPeriod(first(params.days));

  // The breakdown doubles as the channel list, which lets us drop an unknown
  // `?channel=` silently instead of 404-ing the whole page.
  const channels = await getChannelBreakdown(ctx.workspace.id, days, ctx.workspace.timezone);
  const requestedChannel = first(params.channel);
  const channelId = requestedChannel && channels.some((c) => c.id === requestedChannel) ? requestedChannel : undefined;

  const overview = await getOverview(ctx.workspace.id, { days, channelId, timezone: ctx.workspace.timezone });
  const firstRun = channels.length === 0;
  const showChecklist = firstRun || !overview.setup.hasSentDm;

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          firstRun
            ? `Welcome to ${brand.name}. Connect an account to start turning comments into DMs.`
            : `What your automations did over the last ${days} days.`
        }
        actions={
          firstRun ? undefined : (
            <PeriodControls
              days={days}
              channelId={channelId ?? null}
              channels={channels.map((c) => ({ id: c.id, platform: c.platform, username: c.username, name: c.name }))}
            />
          )
        }
      />

      {firstRun ? (
        <div className="mx-auto max-w-2xl">
          <GettingStarted setup={overview.setup} />
        </div>
      ) : (
        <div className="space-y-6">
          {showChecklist ? <GettingStarted setup={overview.setup} /> : null}

          <StatRow totals={overview.totals} deltas={overview.deltas} days={days} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>DMs sent vs triggers</CardTitle>
                <CardDescription>
                  Daily totals for the last {days} days
                  {overview.period.timezone !== "UTC" ? ` · ${overview.period.timezone}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OverviewChart data={overview.series} />
              </CardContent>
            </Card>
            <UsageCard usage={overview.usage} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopAutomations automations={overview.topAutomations} />
            <SkipReasons reasons={overview.skipReasons} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ActivityFeed items={overview.recentActivity} className="lg:col-span-2" />
            <ChannelBreakdown rows={channels} />
          </div>
        </div>
      )}
    </>
  );
}
