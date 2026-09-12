import type { Metadata } from "next";
import Link from "next/link";
import type { ChannelStatus } from "@prisma/client";
import { Building2, ListChecks, MessageSquare, Plug, Users, Webhook, Workflow } from "lucide-react";

import { HealthChecks } from "@/components/admin/health-checks";
import { SignupsChart } from "@/components/admin/signups-chart";
import { StatusDot, type Tone } from "@/components/admin/status-badge";
import { humanize } from "@/components/admin/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { brand } from "@/lib/brand";
import { getHealth, getPlatformStats, type PlatformHealth } from "@/lib/services/admin";
import { formatNumber } from "@/lib/utils";
import { requireSuperAdmin } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Admin · ${brand.name}` };

const OVERALL: Record<PlatformHealth["status"], { label: string; tone: Tone }> = {
  ok: { label: "All systems operational", tone: "success" },
  degraded: { label: "Degraded", tone: "warning" },
  down: { label: "Database unreachable", tone: "destructive" },
};

const CHANNEL_TONE: Record<ChannelStatus, Tone> = {
  ACTIVE: "success",
  TOKEN_EXPIRED: "warning",
  ERROR: "destructive",
  DISCONNECTED: "muted",
};

export default async function AdminOverviewPage() {
  await requireSuperAdmin();
  const [stats, health] = await Promise.all([getPlatformStats(), getHealth()]);
  const ch = stats.channels;
  const overall = OVERALL[health.status];

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Tenants, traffic and system health across every workspace."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/workspaces">All workspaces</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workspaces" value={formatNumber(stats.workspaces)} icon={Building2} hint="Tenants on the platform" />
        <StatCard label="Users" value={formatNumber(stats.users)} icon={Users} hint={`+${stats.signups7d} in the last 7 days`} />
        <StatCard
          label="Connected channels"
          value={formatNumber(ch.total)}
          icon={Plug}
          hint={`${ch.byStatus.ACTIVE} active · ${ch.byPlatform.INSTAGRAM} Instagram · ${ch.byPlatform.FACEBOOK} Facebook`}
        />
        <StatCard label="Active automations" value={formatNumber(stats.automationsActive)} icon={Workflow} hint="Status ACTIVE across all workspaces" />
        <StatCard label="DMs today" value={formatNumber(stats.dmsToday)} icon={MessageSquare} hint="Since 00:00 UTC" />
        <StatCard label="DMs last 7 days" value={formatNumber(stats.dms7d)} icon={MessageSquare} hint="Private replies, messages and broadcasts" />
        <StatCard
          label="Jobs pending"
          value={formatNumber(stats.jobs.pending)}
          icon={ListChecks}
          hint={`${stats.jobs.processing} running · ${stats.jobs.failed} failed · ${stats.jobs.completedToday} completed today`}
        />
        <StatCard
          label="Webhooks (24h)"
          value={formatNumber(stats.webhookEvents24h.total)}
          icon={Webhook}
          hint={`${stats.webhookEvents24h.errors} with errors`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Signups</CardTitle>
            <CardDescription>New users per day over the last 30 days (UTC).</CardDescription>
          </CardHeader>
          <CardContent>
            <SignupsChart data={stats.signupsSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>System health</CardTitle>
              <CardDescription className="inline-flex items-center gap-1.5">
                <StatusDot tone={overall.tone} />
                {overall.label}
              </CardDescription>
            </div>
            <Link href="/admin/health" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Details
            </Link>
          </CardHeader>
          <CardContent>
            <HealthChecks health={health} compact />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Channels by status</CardTitle>
            <CardDescription>Expired tokens and errors need the workspace owner to reconnect.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {(Object.keys(ch.byStatus) as ChannelStatus[]).map((status) => (
                <li key={status} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="inline-flex items-center gap-2.5">
                    <StatusDot tone={CHANNEL_TONE[status]} />
                    {humanize(status)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{formatNumber(ch.byStatus[status])}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>Queue</CardTitle>
              <CardDescription>Live counts from the Postgres job table.</CardDescription>
            </div>
            <Link href="/admin/jobs" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Open queue
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {[
                { label: "Pending", value: stats.jobs.pending, href: "/admin/jobs?status=PENDING" },
                { label: "Processing", value: stats.jobs.processing, href: "/admin/jobs?status=PROCESSING" },
                { label: "Failed", value: stats.jobs.failed, href: "/admin/jobs?status=FAILED" },
                { label: "Completed today", value: stats.jobs.completedToday, href: "/admin/jobs?status=COMPLETED" },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between py-2 text-[13px]">
                  <Link href={row.href} className="underline-offset-4 hover:underline">
                    {row.label}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">{formatNumber(row.value)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
