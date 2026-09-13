import type { DeliveryStatus } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, Layers } from "lucide-react";

import { BarList } from "@/components/charts/bar-list";
import { VIZ } from "@/components/charts/tokens";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryReason } from "@/lib/errors/customer-messages";
import { cn, initials } from "@/lib/utils";

import { AutoRefresh } from "./auto-refresh";
import { BroadcastActions } from "./broadcast-actions";
import { channelLabel, formatCount, formatDateTime, progressParts, statusMeta, summarizeAudience } from "./format";
import { MessagePreview } from "./message-preview";
import type { BroadcastRow, BroadcastStats } from "./types";

export type ReportDelivery = {
  id: string;
  status: DeliveryStatus;
  createdAt: string;
  reason: string | null;
  recipientUsername: string | null;
  contact: { id: string; username: string | null; name: string | null; avatarUrl: string | null } | null;
};

export interface BroadcastReportProps {
  row: BroadcastRow;
  stats: BroadcastStats;
  deliveries: ReportDelivery[];
  deliveryTotal: number;
  timeZone: string;
  channelAvatarUrl?: string | null;
}

const LOG_ROWS = 20;

function share(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const pct = (part / whole) * 100;
  return `${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/** Read-only view for SENDING / SENT / FAILED / CANCELLED broadcasts. Server component. */
function BroadcastReport({ row, stats, deliveries, deliveryTotal, timeZone, channelAvatarUrl }: BroadcastReportProps) {
  const meta = statusMeta(row.status);
  const p = progressParts(row);
  const sending = row.status === "SENDING";
  const total = Math.max(stats.target, stats.sent + stats.skipped + stats.failed);
  const notSent = stats.skipped;

  const reasons = (Object.entries(stats.byStatus) as Array<[DeliveryStatus, number]>)
    .filter(([status, count]) => status !== "SENT" && count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ key: status, label: deliveryReason(status).label, value: count }));

  const segments = [
    { key: "sent", label: "Sent", value: stats.sent, color: VIZ.accent },
    { key: "skipped", label: "Not sent", value: stats.skipped, color: VIZ.context },
    { key: "failed", label: "Failed", value: stats.failed, color: "hsl(var(--destructive))" },
  ].filter((s) => s.value > 0);

  const rows = deliveries.slice(0, LOG_ROWS);

  return (
    <>
      <PageHeader
        backHref="/broadcasts"
        backLabel="Broadcasts"
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {row.name}
            <Badge variant={meta.variant} className={sending ? "animate-pulse" : undefined}>
              {meta.label}
            </Badge>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span className="inline-flex items-center gap-1.5">
              <PlatformIcon platform={row.channel.platform} size={14} />
              {channelLabel(row.channel)}
            </span>
            <span aria-hidden>·</span>
            {row.segmentName ? (
              <Link
                href={`/contacts?segment=${encodeURIComponent(row.audience.segmentId ?? "")}`}
                className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
                title={summarizeAudience(row.audience)}
              >
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                {row.segmentName}
              </Link>
            ) : (
              <span>{summarizeAudience(row.audience)}</span>
            )}
          </span>
        }
        actions={<BroadcastActions row={row} variant="buttons" />}
      />

      {row.status === "FAILED" ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px]" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">This broadcast didn&apos;t go out.</p>
            <p className="text-muted-foreground">
              Check that the account is still connected on{" "}
              <Link href="/channels" className="underline underline-offset-2">
                Channels
              </Link>{" "}
              and that your plan includes broadcasts, then send it again.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-5 p-5">
              {sending ? (
                <div className="flex items-center justify-between gap-4 text-[13px]" role="status">
                  <span className="font-medium">
                    Sending: {formatCount(p.processed)} of {formatCount(p.target)} done
                  </span>
                  <span className="text-xs text-muted-foreground">This page updates on its own</span>
                  <AutoRefresh intervalMs={5000} />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <Figure label="Audience" value={formatCount(stats.target)} detail="Matched when sending started" />
                <Figure label="Sent" value={formatCount(stats.sent)} detail={`${share(stats.sent, stats.target)} of the audience`} />
                <Figure label="Not sent" value={formatCount(notSent)} detail={notSent > 0 ? "See the reasons below" : "Nobody was skipped"} />
                <Figure label="Failed" value={formatCount(stats.failed)} detail={stats.pendingJobs > 0 ? `${formatCount(stats.pendingJobs)} still in the queue` : undefined} />
              </div>

              {total > 0 ? (
                <div>
                  <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-muted" aria-hidden>
                    {segments.map((s) => (
                      <div key={s.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
                    ))}
                  </div>
                  <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {segments.map((s) => (
                      <li key={s.key} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                        {s.label}
                        <span className="tabular-nums text-foreground">{formatCount(s.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {reasons.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Why some people didn&apos;t get it</CardTitle>
                {stats.byStatus.SKIPPED_WINDOW ? (
                  <CardDescription>
                    {row.channel.platform === "FACEBOOK" ? "Facebook" : "Instagram"} only lets a broadcast reach people who messaged you in the last 24 hours.
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent>
                <BarList items={reasons} valueLabel="people" />
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle>Recipients</CardTitle>
                <CardDescription>
                  {deliveryTotal === 0
                    ? "No one yet."
                    : deliveryTotal > rows.length
                      ? `The latest ${rows.length} of ${formatCount(deliveryTotal)}.`
                      : `${formatCount(deliveryTotal)} ${deliveryTotal === 1 ? "person" : "people"}.`}
                </CardDescription>
              </div>
              {deliveryTotal > rows.length ? (
                <Link
                  href={`/logs?broadcastId=${encodeURIComponent(row.id)}`}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  See everyone in Logs
                </Link>
              ) : null}
            </CardHeader>
            {rows.length === 0 ? (
              <p className="border-t px-5 py-6 text-[13px] text-muted-foreground">
                {sending ? "People appear here as each message goes out." : "Nothing to show."}
              </p>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Contact</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="pr-5 text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((d) => {
                      const username = d.contact?.username ?? d.recipientUsername;
                      const label = username ? `@${username.replace(/^@/, "")}` : (d.contact?.name ?? "Unknown contact");
                      const sent = d.status === "SENT";
                      const failed = d.status === "FAILED";
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="pl-5">
                            <span className="inline-flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                {d.contact?.avatarUrl ? <AvatarImage src={d.contact.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
                                <AvatarFallback className="text-[9px]">{initials(d.contact?.name ?? username, "?")}</AvatarFallback>
                              </Avatar>
                              {d.contact ? (
                                <Link href={`/contacts/${d.contact.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                                  {label}
                                </Link>
                              ) : (
                                <span className="truncate">{label}</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <span className={cn("h-1.5 w-1.5 rounded-full", sent ? "bg-success" : failed ? "bg-destructive" : "bg-muted-foreground/50")} aria-hidden />
                              {sent ? "Sent" : (d.reason ?? (failed ? "Failed" : "Not sent"))}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap pr-5 text-right tabular-nums text-muted-foreground">{formatDateTime(d.createdAt, timeZone)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <MessagePreview message={row.message} platform={row.channel.platform} senderName={channelLabel(row.channel)} senderAvatarUrl={channelAvatarUrl} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-right tabular-nums">{formatDateTime(row.createdAt, timeZone)}</dd>
                {row.scheduledAt ? (
                  <>
                    <dt className="text-muted-foreground">Scheduled for</dt>
                    <dd className="text-right tabular-nums">{formatDateTime(row.scheduledAt, timeZone)}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Started</dt>
                <dd className="text-right tabular-nums">{formatDateTime(row.startedAt, timeZone)}</dd>
                <dt className="text-muted-foreground">{row.status === "CANCELLED" ? "Cancelled" : "Finished"}</dt>
                <dd className="text-right tabular-nums">{formatDateTime(row.completedAt, timeZone)}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export { BroadcastReport };
