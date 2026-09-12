import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plug, ScrollText, Send, Users, Workflow } from "lucide-react";

import { humanize, PLAN_LABELS } from "@/components/admin/constants";
import { formatUtcDate, prettyJson, truncateText } from "@/components/admin/format";
import { PlanSelector } from "@/components/admin/plan-selector";
import {
  AutomationStatusBadge,
  ChannelStatusBadge,
  DeliveryStatusBadge,
} from "@/components/admin/status-badge";
import { TimeAgo } from "@/components/admin/time-ago";
import { UsageBars } from "@/components/admin/usage-bars";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brand } from "@/lib/brand";
import { getWorkspaceDetail, type AdminWorkspaceChannel } from "@/lib/services/admin";
import { cn, formatNumber, initials } from "@/lib/utils";
import { requireSuperAdmin } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Workspace · Admin · ${brand.name}` };

type Params = Promise<{ id: string }>;

function TokenCell({ channel }: { channel: AdminWorkspaceChannel }) {
  if (channel.status === "DISCONNECTED") return <span className="text-muted-foreground">—</span>;
  if (channel.tokenDaysLeft === null) {
    return (
      <span className="text-muted-foreground" title="Facebook page tokens don't expire; they can only be invalidated">
        Doesn&apos;t expire
      </span>
    );
  }
  const d = channel.tokenDaysLeft;
  const tone = d < 0 ? "text-destructive" : d <= 10 ? "text-warning" : "";
  return (
    <span className={cn("tabular-nums", tone)} title={channel.tokenExpiresAt ?? undefined}>
      {d < 0 ? `Expired ${Math.abs(d)}d ago` : d === 0 ? "Expires today" : `${d}d left`}
    </span>
  );
}

function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 pb-5 text-[13px] text-muted-foreground">{children}</p>;
}

export default async function AdminWorkspaceDetailPage({ params }: { params: Params }) {
  await requireSuperAdmin();
  const { id } = await params;
  const detail = await getWorkspaceDetail(id);
  if (!detail) notFound();

  const { workspace, billing, members, pendingInvitations, channels, automations, usage, recentDeliveries, auditLog, totals } = detail;
  const activeChannels = channels.filter((c) => c.status === "ACTIVE").length;
  const activeAutomations = automations.filter((a) => a.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        backHref="/admin/workspaces"
        backLabel="Workspaces"
        title={workspace.name}
        description={
          <>
            <span className="font-mono">{workspace.slug}</span> · created {formatUtcDate(workspace.createdAt)} · {workspace.timezone}
            {workspace.onboardedAt ? null : " · onboarding not completed"}
          </>
        }
        actions={
          <PlanSelector
            key={`${workspace.plan}:${billing.planSource}`}
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            plan={workspace.plan}
            planSource={billing.planSource}
            hasSubscription={billing.billingSubscriptionId !== null}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Plan"
          value={PLAN_LABELS[billing.effectivePlan]}
          hint={
            billing.planSource === "ADMIN_OVERRIDE"
              ? "Admin override"
              : billing.planSource === "SUBSCRIPTION"
                ? `Subscription · ${humanize(billing.billingStatus)}`
                : `$${usage.limits.priceUsd}/mo · default`
          }
        />
        <StatCard label="Members" value={members.length} icon={Users} hint={`${pendingInvitations} pending invite${pendingInvitations === 1 ? "" : "s"}`} />
        <StatCard label="Channels" value={channels.length} icon={Plug} hint={`${activeChannels} active`} />
        <StatCard label="Automations" value={automations.length} icon={Workflow} hint={`${activeAutomations} active`} />
        <StatCard
          label="DMs this period"
          value={formatNumber(usage.dms.used)}
          icon={Send}
          hint={`of ${formatNumber(usage.dms.limit)} · resets ${formatUtcDate(usage.periodEnd)}`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Against the {usage.limits.label} plan limits.</CardDescription>
          </CardHeader>
          <CardContent>
            <UsageBars usage={usage} />
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-[13px]">
              {(
                [
                  ["Contacts", totals.contacts],
                  ["Conversations", totals.conversations],
                  ["Deliveries", totals.deliveries],
                  ["Broadcasts", totals.broadcasts],
                  ["Tracked links", totals.trackedLinks],
                ] as Array<[string, number]>
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums">{formatNumber(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Owner, admins and members with access to this workspace.</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7">
                        {m.user.avatarUrl ? <AvatarImage src={m.user.avatarUrl} alt="" /> : null}
                        <AvatarFallback>{initials(m.user.name ?? m.user.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.user.name ?? m.user.email}</p>
                        {m.user.name ? <p className="truncate text-xs text-muted-foreground">{m.user.email}</p> : null}
                      </div>
                      {m.user.isSuperAdmin ? <Badge variant="outline">Super admin</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.role === "OWNER" ? "default" : "secondary"}>{humanize(m.role)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatUtcDate(m.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>
            Dodo Payments state as last synced by webhooks. Overrides win over the subscription until cleared.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["Plan source", humanize(billing.planSource)],
                ["Stored plan", PLAN_LABELS[workspace.plan]],
                ["Effective plan", PLAN_LABELS[billing.effectivePlan]],
                ["Subscribed plan", billing.subscribedPlan ? PLAN_LABELS[billing.subscribedPlan] : "—"],
                ["Billing status", humanize(billing.billingStatus)],
                ["Interval", billing.billingInterval ? humanize(billing.billingInterval) : "—"],
                ["Period end", formatUtcDate(billing.currentPeriodEnd)],
                ["Cancel at period end", billing.cancelAtPeriodEnd ? "Yes" : "No"],
                ["Billing email", billing.billingEmail ?? "—"],
                ["Customer id", billing.billingCustomerId ?? "—"],
                ["Subscription id", billing.billingSubscriptionId ?? "—"],
              ] as Array<[string, string]>
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-mono text-xs" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>Connected Instagram accounts and Facebook pages. Tokens are never shown.</CardDescription>
        </CardHeader>
        {channels.length === 0 ? (
          <SectionEmpty>No channels connected.</SectionEmpty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead className="text-right">Followers</TableHead>
                <TableHead className="text-right">Automations</TableHead>
                <TableHead>Last sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={c.platform} size={14} className="text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.username ? `@${c.username}` : (c.name ?? c.externalId)}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{c.externalId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <ChannelStatusBadge status={c.status} />
                      {c.lastError ? (
                        <span className="max-w-[220px] truncate font-mono text-[11px] text-destructive" title={c.lastError}>
                          {truncateText(c.lastError, 40)}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TokenCell channel={c} />
                  </TableCell>
                  <TableCell>
                    {c.webhookSubscribed ? "Subscribed" : <span className="text-warning">Not subscribed</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.followerCount === null ? "—" : formatNumber(c.followerCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.automationCount}</TableCell>
                  <TableCell>
                    <TimeAgo iso={c.lastSyncedAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Automations</CardTitle>
          <CardDescription>Most recently edited first (up to 50).</CardDescription>
        </CardHeader>
        {automations.length === 0 ? (
          <SectionEmpty>No automations yet.</SectionEmpty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Triggered</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead>Last triggered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>
                    <AutomationStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell>
                    <p>{humanize(a.triggerType)}</p>
                    <p className="truncate text-xs text-muted-foreground" title={a.keywords.join(", ")}>
                      {a.matchMode === "ANY" ? "Any text" : a.keywords.length ? truncateText(a.keywords.join(", "), 40) : "No keywords"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformIcon platform={a.channel.platform} size={12} className="text-muted-foreground" />
                      {a.channel.username ? `@${a.channel.username}` : (a.channel.name ?? "—")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(a.triggeredCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(a.sentCount)}</TableCell>
                  <TableCell>
                    <TimeAgo iso={a.lastTriggeredAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent deliveries</CardTitle>
            <CardDescription>Last 20 send attempts, newest first.</CardDescription>
          </CardHeader>
          {recentDeliveries.length === 0 ? (
            <SectionEmpty>Nothing sent yet.</SectionEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDeliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <p>{humanize(d.kind)}</p>
                      {d.automationName ? <p className="truncate text-xs text-muted-foreground">{d.automationName}</p> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <DeliveryStatusBadge status={d.status} />
                        {d.errorMessage ? (
                          <span className="max-w-[200px] truncate font-mono text-[11px] text-destructive" title={d.errorMessage}>
                            {truncateText(d.errorMessage, 36)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{d.recipientUsername ? `@${d.recipientUsername}` : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <TimeAgo iso={d.createdAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
            <CardDescription>Last 30 recorded actions, including admin plan overrides.</CardDescription>
          </CardHeader>
          {auditLog.length === 0 ? (
            <SectionEmpty>No audit entries.</SectionEmpty>
          ) : (
            <CardContent>
              <ul className="divide-y">
                {auditLog.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-xs">{entry.action}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {entry.actor ? entry.actor.email : "system"}
                        {entry.targetType ? ` · ${entry.targetType}` : ""}
                        {entry.metadata !== null && entry.metadata !== undefined ? (
                          <span className="ml-1 font-mono" title={prettyJson(entry.metadata)}>
                            {truncateText(JSON.stringify(entry.metadata), 60)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <TimeAgo iso={entry.createdAt} className="shrink-0 text-xs text-muted-foreground" />
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
