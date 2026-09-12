import type { DeliveryStatus } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Layers, Send, Users, XCircle } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initials } from "@/lib/utils";

import { AutoRefresh } from "./auto-refresh";
import { BroadcastActions } from "./broadcast-actions";
import { channelLabel, deliveryMeta, formatCount, formatDateTime, progressParts, statusMeta, summarizeAudience } from "./format";
import { MessagePreview } from "./message-preview";
import type { BroadcastRow, BroadcastStats } from "./types";

export type ReportDelivery = {
  id: string;
  status: DeliveryStatus;
  createdAt: string;
  errorMessage: string | null;
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

/** Read-only view for SENDING / SENT / FAILED / CANCELLED broadcasts. Server component. */
function BroadcastReport({ row, stats, deliveries, deliveryTotal, timeZone, channelAvatarUrl }: BroadcastReportProps) {
  const meta = statusMeta(row.status);
  const p = progressParts(row);
  const sentPct = p.target > 0 ? (p.sent / p.target) * 100 : 0;
  const otherPct = p.target > 0 ? (p.other / p.target) * 100 : 0;
  const outsideWindow = stats.byStatus.SKIPPED_WINDOW ?? 0;
  const sending = row.status === "SENDING";

  return (
    <>
      <PageHeader
        backHref="/broadcasts"
        backLabel="Broadcasts"
        title={row.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span className="inline-flex items-center gap-1.5">
              <PlatformIcon platform={row.channel.platform} size={14} />
              {channelLabel(row.channel)}
            </span>
            <span aria-hidden>·</span>
            {row.segmentName ? (
              <Link href={`/contacts?segment=${encodeURIComponent(row.audience.segmentId ?? "")}`} className="inline-flex items-center gap-1 text-foreground hover:underline" title={summarizeAudience(row.audience)}>
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                Segment: {row.segmentName}
              </Link>
            ) : (
              <span>{summarizeAudience(row.audience)}</span>
            )}
          </span>
        }
        actions={
          <>
            <Badge variant={meta.variant} className={sending ? "animate-pulse" : undefined}>
              {meta.label}
            </Badge>
            <BroadcastActions row={row} variant="buttons" />
          </>
        }
      />

      {sending ? (
        <div className="mb-6 rounded-lg border bg-muted/40 px-4 py-3" role="status">
          <div className="flex items-center justify-between gap-4 text-[13px]">
            <span className="inline-flex items-center gap-2 font-medium">
              <Send className="h-3.5 w-3.5" />
              Sending — {formatCount(p.processed)} of {formatCount(p.target)} processed
            </span>
            <span className="text-muted-foreground">Refreshes automatically</span>
          </div>
          <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground transition-[width]" style={{ width: `${sentPct}%` }} />
            <div className="h-full bg-muted-foreground/40 transition-[width]" style={{ width: `${otherPct}%` }} />
          </div>
          <AutoRefresh intervalMs={5000} />
        </div>
      ) : null}

      {row.status === "FAILED" ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px]" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">This broadcast failed.</p>
            <p className="text-muted-foreground">
              Nothing was delivered. Usual causes: the channel token expired, the plan no longer includes broadcasts, or Meta rejected every send. Check the delivery log below and{" "}
              <Link href="/channels" className="underline underline-offset-2">
                Channels
              </Link>
              .
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Audience" value={formatCount(stats.target)} hint="Contacts matched at send time" icon={Users} />
        <StatCard label="Sent" value={formatCount(stats.sent)} hint={stats.target > 0 ? `${Math.round((stats.sent / stats.target) * 100)}% of audience` : "—"} icon={CheckCircle2} />
        <StatCard label="Skipped" value={formatCount(stats.skipped)} hint={outsideWindow > 0 ? `${formatCount(outsideWindow)} outside the 24h window` : "Opted out, limits or self"} icon={Clock} />
        <StatCard label="Failed" value={formatCount(stats.failed)} hint={stats.pendingJobs > 0 ? `${formatCount(stats.pendingJobs)} still queued` : "Rejected by Meta"} icon={XCircle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Delivery log</CardTitle>
            <CardDescription>
              {deliveryTotal === 0
                ? "No deliveries recorded yet."
                : deliveryTotal > deliveries.length
                  ? `Latest ${deliveries.length} of ${formatCount(deliveryTotal)} — the full history is in Logs.`
                  : `${formatCount(deliveryTotal)} contact${deliveryTotal === 1 ? "" : "s"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {deliveries.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted-foreground">
                {sending ? "Messages are being sent — entries appear here as each one completes." : "Nothing to show."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Contact</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="hidden md:table-cell">Detail</TableHead>
                    <TableHead className="pr-5 text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => {
                    const dm = deliveryMeta(d.status);
                    const username = d.contact?.username ?? d.recipientUsername;
                    const label = username ? `@${username.replace(/^@/, "")}` : (d.contact?.name ?? "Unknown contact");
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="pl-5">
                          <span className="inline-flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              {d.contact?.avatarUrl ? <AvatarImage src={d.contact.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
                              <AvatarFallback className="text-[9px]">{initials(d.contact?.name ?? username, "?")}</AvatarFallback>
                            </Avatar>
                            {d.contact ? (
                              <Link href={`/contacts/${d.contact.id}`} className="truncate font-medium hover:underline">
                                {label}
                              </Link>
                            ) : (
                              <span className="truncate">{label}</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={dm.variant}>{dm.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-[320px] md:table-cell">
                          <span className="block truncate text-muted-foreground" title={d.errorMessage ?? undefined}>
                            {d.errorMessage ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="pr-5 text-right tabular-nums text-muted-foreground">{formatDateTime(d.createdAt, timeZone)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <MessagePreview message={row.message} platform={row.channel.platform} senderName={channelLabel(row.channel)} senderAvatarUrl={channelAvatarUrl} />
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="tabular-nums">{formatDateTime(row.createdAt, timeZone)}</dd>
                {row.scheduledAt ? (
                  <>
                    <dt className="text-muted-foreground">Scheduled</dt>
                    <dd className="tabular-nums">{formatDateTime(row.scheduledAt, timeZone)}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Started</dt>
                <dd className="tabular-nums">{formatDateTime(row.startedAt, timeZone)}</dd>
                <dt className="text-muted-foreground">{row.status === "CANCELLED" ? "Cancelled" : "Completed"}</dt>
                <dd className="tabular-nums">{formatDateTime(row.completedAt, timeZone)}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export { BroadcastReport };
