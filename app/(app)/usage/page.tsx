import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { TriangleAlert } from "lucide-react";

import { PlanBadge } from "@/components/billing/plan-badge";
import { Meter, meterLevel, UsageBars, type UsageRow } from "@/components/settings/usage-bars";
import { UsageBreakdown } from "@/components/settings/usage-breakdown";
import { UsageHistoryChart } from "@/components/settings/usage-history-chart";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformMark } from "@/components/ui/platform-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { historyLabel } from "@/lib/billing/plans";
import { getOrganizationUsage } from "@/lib/billing/usage";
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

function rise(index: number): React.CSSProperties {
  return { "--i": index } as React.CSSProperties;
}

export default async function UsagePage() {
  const ctx = await requireWorkspaceContext();
  const [history, usage] = await Promise.all([getUsageHistory(ctx.organization.id, 6), getOrganizationUsage(ctx.organization.id)]);
  const multipleWorkspaces = ctx.workspaces.length > 1;
  const period = history.currentPeriod;
  const canUpgrade = canManageBilling(ctx.role) && period.plan !== "AGENCY";
  const upgradeLabel = period.plan === "NONE" ? "Choose a plan" : "Upgrade";

  const level = meterLevel(period.used, period.limit);
  // The last day of the period is the day before it resets.
  const periodEndLabel = utcDay(new Date(new Date(period.resetsAt).getTime() - 86_400_000).toISOString());

  const limits: UsageRow[] = [
    { label: "Connected accounts", used: usage.channels.used, limit: usage.channels.limit, tone: "yellow" },
    { label: "Workspaces", used: usage.workspaces.used, limit: usage.workspaces.limit, tone: "indigo" },
    { label: "Automations", used: usage.automations.used, limit: usage.automations.limit, tone: "purple" },
    {
      label: "Contacts",
      used: usage.contacts.used,
      limit: usage.contacts.limit,
      hint: usage.contacts.used > usage.contacts.limit ? "Automations skip the newest contacts past the limit" : undefined,
      tone: "green",
    },
    ...(usage.broadcasts.limit > 0
      ? [{ label: "Broadcasts this month", used: usage.broadcasts.used, limit: usage.broadcasts.limit, hint: `Resets ${utcDay(period.resetsAt)}`, tone: "orange" as const }]
      : []),
    { label: "Team seats", used: usage.members.used, limit: usage.members.limit, hint: "Includes pending invites", tone: "indigo" },
  ];

  const channelItems = period.perChannel.map((row) => ({
    key: row.channel.id,
    label: (
      <span className="inline-flex min-w-0 items-center gap-2">
        <PlatformMark platform={row.channel.platform} size={18} />
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
    current: m.isCurrent,
  }));

  const breakdowns = [
    ...(multipleWorkspaces ? [{ key: "workspace", title: "By workspace", items: workspaceItems }] : []),
    { key: "account", title: "By account", items: channelItems },
    { key: "automation", title: "By automation", items: automationItems },
  ];

  return (
    <div>
      <PageHeader
        title="Usage"
        actions={
          canUpgrade ? (
            <Button asChild variant="highlight" size="sm">
              <Link href="/settings/billing">{upgradeLabel}</Link>
            </Button>
          ) : null
        }
      />

      <div className="space-y-6">
        {history.warnings.map((w) => (
          <div
            key={w.message}
            role="status"
            className={cn(
              "flex items-start gap-3 rounded-2xl px-4 py-3 text-[13px] text-ink",
              w.level === "critical" ? "bg-destructive/10" : "bg-orange-soft",
            )}
          >
            <TriangleAlert className={cn("mt-0.5 h-4 w-4 shrink-0", w.level === "critical" ? "text-destructive" : "text-orange-ink")} />
            <p className="flex-1">{w.message}</p>
            {canUpgrade ? (
              <Link href="/settings/billing" className="shrink-0 font-semibold underline underline-offset-4 hover:no-underline">
                {upgradeLabel}
              </Link>
            ) : null}
          </div>
        ))}

        {/* The number this page is for, as its one colour block, in the Settings indigo. */}
        <section aria-labelledby="dms-title" className="rise relative overflow-hidden rounded-3xl bg-indigo text-white">
          <div
            aria-hidden
            className="bg-grid bg-grid-light pointer-events-none absolute inset-0 [--grid-size:40px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]"
          />
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id="dms-title" className="brand-label text-white/70">
                DMs this month
              </h2>
              <div className="flex items-center gap-2 text-[12px] tabular-nums text-white/70">
                {utcDay(period.periodStart)} – {periodEndLabel}
                <PlanBadge plan={period.plan} className="bg-white text-ink" />
              </div>
            </div>

            <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={cn("font-display text-[64px] leading-[0.85] tabular-nums sm:text-[96px]", level === "full" && "text-orange")}>
                {period.used.toLocaleString("en-US")}
              </span>
              <span className="text-[15px] text-white/70">of {period.limit.toLocaleString("en-US")}</span>
            </p>

            <Meter used={period.used} limit={period.limit} label="DMs used this month" size="lg" dark className="mt-6" />

            <dl className="mt-6 grid grid-cols-3 gap-4 text-[13px]">
              <div className="min-w-0">
                <dt className="brand-label text-white/70">Used</dt>
                <dd className="mt-1.5 font-semibold tabular-nums">{Math.round(period.pct * 100)}%</dd>
              </div>
              <div className="min-w-0">
                <dt className="brand-label text-white/70">At this pace</dt>
                <dd className={cn("mt-1.5 font-semibold tabular-nums", period.overLimit && period.limit > 0 && "text-orange")}>
                  {formatNumber(period.projected)} by {periodEndLabel}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="brand-label text-white/70">Resets</dt>
                <dd className="mt-1.5 font-semibold">{utcDay(period.resetsAt, "EEE, MMM d")}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section aria-labelledby="limits-title" className="rise rounded-2xl border bg-card p-5 sm:p-6" style={rise(1)}>
          <h2 id="limits-title" className="brand-label mb-5 text-muted-foreground">
            Plan limits
          </h2>
          <UsageBars rows={limits} className="sm:grid-cols-3" />
          <p className="mt-5 border-t pt-4 text-[13px] text-muted-foreground">
            Conversations and delivery logs are kept for {historyLabel(usage.historyDays)}, then deleted. Contacts, automations and monthly totals stay.
          </p>
        </section>

        <div className={cn("grid grid-cols-1 gap-4", multipleWorkspaces ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
          {breakdowns.map((b, i) => (
            <section key={b.key} className="rise rounded-2xl border bg-card p-5 sm:p-6" style={rise(i + 2)}>
              <h2 className="brand-label mb-5 text-muted-foreground">{b.title}</h2>
              <UsageBreakdown items={b.items} />
            </section>
          ))}
        </div>

        <section aria-labelledby="history-title" className="rise overflow-hidden rounded-2xl border bg-card" style={rise(breakdowns.length + 2)}>
          <div className="p-5 sm:p-6">
            <h2 id="history-title" className="brand-label text-muted-foreground">
              Last 6 months
            </h2>
            <UsageHistoryChart data={columns} limit={period.limit} className="mt-8" />
          </div>
          <div className="border-t">
            {/* Seven columns don't fit a phone; the headers stay on one line and the table scrolls sideways. */}
            <Table className="[&_th]:whitespace-nowrap">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 sm:pl-6">Month</TableHead>
                  <TableHead className="text-right">DMs sent</TableHead>
                  <TableHead className="text-right">From comments</TableHead>
                  <TableHead className="text-right">From DMs and stories</TableHead>
                  <TableHead className="text-right">Broadcasts</TableHead>
                  <TableHead className="text-right">Comment replies</TableHead>
                  <TableHead className="pr-5 text-right sm:pr-6">Of limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...history.months].reverse().map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="whitespace-nowrap pl-5 font-semibold sm:pl-6">
                      {m.label}
                      {m.isCurrent ? <span className="ml-2 text-xs font-normal text-muted-foreground">so far</span> : null}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatNumber(m.dmsSent)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.privateReplies)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.messages)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.broadcasts)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(m.publicReplies)}</TableCell>
                    <TableCell
                      className={cn("pr-5 text-right tabular-nums sm:pr-6", m.overagePct > 1 ? "font-semibold text-destructive" : "text-muted-foreground")}
                    >
                      {Math.round(m.overagePct * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">Comment replies don&apos;t count toward your limit.</p>
        </section>
      </div>
    </div>
  );
}
