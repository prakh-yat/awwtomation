"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { BroadcastActions } from "./broadcast-actions";
import { audienceLabel, channelLabel, formatCount, formatDateTime, progressParts, statusMeta, summarizeAudience } from "./format";
import type { BroadcastRow } from "./types";

type StatusFilter = "ALL" | BroadcastRow["status"];

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "SENDING", label: "Sending" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function whenLabel(row: BroadcastRow, timeZone: string): { label: string; value: string } {
  switch (row.status) {
    case "SCHEDULED":
      return { label: "Scheduled", value: formatDateTime(row.scheduledAt, timeZone) };
    case "SENDING":
      return { label: "Started", value: formatDateTime(row.startedAt, timeZone) };
    case "SENT":
    case "FAILED":
      return { label: "Completed", value: formatDateTime(row.completedAt ?? row.startedAt, timeZone) };
    case "CANCELLED":
      return { label: "Cancelled", value: formatDateTime(row.completedAt, timeZone) };
    default:
      return { label: "Updated", value: formatDateTime(row.updatedAt, timeZone) };
  }
}

/** Two-tone bar: black = sent, gray = failed/skipped, empty = still queued. */
function DeliveryCell({ row }: { row: BroadcastRow }) {
  if (row.status === "DRAFT" || row.status === "SCHEDULED") return <span className="text-muted-foreground">—</span>;
  const p = progressParts(row);
  const sentPct = p.target > 0 ? (p.sent / p.target) * 100 : 0;
  const otherPct = p.target > 0 ? (p.other / p.target) * 100 : 0;
  return (
    <div className="min-w-[140px]">
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className="font-medium">{formatCount(row.sentCount)}</span>
        <span className="text-muted-foreground">/ {formatCount(row.targetCount)} sent</span>
      </div>
      <div className="mt-1.5 flex h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)}>
        <div className="h-full bg-foreground" style={{ width: `${sentPct}%` }} />
        <div className="h-full bg-muted-foreground/40" style={{ width: `${otherPct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {row.skippedCount > 0 ? `${formatCount(row.skippedCount)} skipped` : null}
        {row.skippedCount > 0 && row.failedCount > 0 ? " · " : null}
        {row.failedCount > 0 ? `${formatCount(row.failedCount)} failed` : null}
        {row.skippedCount === 0 && row.failedCount === 0 ? (row.status === "SENDING" ? "In progress" : "All delivered") : null}
      </p>
    </div>
  );
}

function BroadcastList({ rows, timeZone }: { rows: BroadcastRow[]; timeZone: string }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("ALL");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "ALL" || r.status === status) && (!q || r.name.toLowerCase().includes(q) || channelLabel(r.channel).toLowerCase().includes(q)));
  }, [rows, query, status]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search broadcasts…" className="pl-8" aria-label="Search broadcasts" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {filtered.length === rows.length ? `${rows.length} broadcast${rows.length === 1 ? "" : "s"}` : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Account</TableHead>
              <TableHead className="hidden lg:table-cell">Audience</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Delivery</TableHead>
              <TableHead className="hidden md:table-cell">When</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No broadcasts match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const meta = statusMeta(row.status);
                const when = whenLabel(row, timeZone);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[180px] sm:max-w-[260px]">
                      <Link href={`/broadcasts/${row.id}`} className="block truncate font-medium text-foreground hover:underline">
                        {row.name}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Created {formatDateTime(row.createdAt, timeZone)}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        <PlatformIcon platform={row.channel.platform} size={14} className="text-muted-foreground" />
                        <span className="truncate">{channelLabel(row.channel)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-[240px] lg:table-cell">
                      <span className={cn("block truncate", row.segmentName ? "text-foreground" : "text-muted-foreground")} title={summarizeAudience(row.audience)}>
                        {audienceLabel(row)}
                      </span>
                      {row.segmentName ? (
                        <span className="block truncate text-[11px] text-muted-foreground" title={summarizeAudience(row.audience)}>
                          {summarizeAudience(row.audience)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} className={cn(row.status === "SENDING" && "animate-pulse")}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <DeliveryCell row={row} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-[11px] text-muted-foreground">{when.label}</p>
                      <p className="tabular-nums">{when.value}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <BroadcastActions row={row} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export { BroadcastList };
