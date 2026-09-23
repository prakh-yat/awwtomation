"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { FilterMenu } from "@/components/ui/filter-menu";
import { Input } from "@/components/ui/input";
import { PlatformMark } from "@/components/ui/platform-badge";

import { BroadcastActions } from "./broadcast-actions";
import { audienceLabel, channelLabel, formatCount, formatDateTime, progressParts, statusMeta, summarizeAudience } from "./format";
import type { BroadcastRow } from "./types";

type StatusFilter = "ALL" | BroadcastRow["status"];

/** Each status with the colour of its badge, as the dot beside it in the filter menu. */
const FILTERS: Array<{ value: StatusFilter; label: string; dot?: string }> = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Drafts", dot: "bg-mute/50" },
  { value: "SCHEDULED", label: "Scheduled", dot: "bg-sky" },
  { value: "SENDING", label: "Sending", dot: "bg-blue" },
  { value: "SENT", label: "Sent", dot: "bg-green" },
  { value: "FAILED", label: "Failed", dot: "bg-destructive" },
  { value: "CANCELLED", label: "Cancelled", dot: "bg-mute/50" },
];

function whenLabel(row: BroadcastRow, timeZone: string): { label: string; value: string } {
  switch (row.status) {
    case "SCHEDULED":
      return { label: "Goes out", value: formatDateTime(row.scheduledAt, timeZone) };
    case "SENDING":
      return { label: "Started", value: formatDateTime(row.startedAt, timeZone) };
    case "SENT":
    case "FAILED":
      return { label: "Finished", value: formatDateTime(row.completedAt ?? row.startedAt, timeZone) };
    case "CANCELLED":
      return { label: "Cancelled", value: formatDateTime(row.completedAt, timeZone) };
    default:
      return { label: "Edited", value: formatDateTime(row.updatedAt, timeZone) };
  }
}

/** Green for sent, orange for everyone it could not reach, empty for still to go. */
function Delivery({ row }: { row: BroadcastRow }) {
  if (row.status === "DRAFT" || row.status === "SCHEDULED") return <span className="text-[13px] text-muted-foreground">Not sent yet</span>;
  const p = progressParts(row);
  const sentPct = p.target > 0 ? (p.sent / p.target) * 100 : 0;
  const otherPct = p.target > 0 ? (p.other / p.target) * 100 : 0;
  return (
    <div className="w-full max-w-[200px]">
      <div className="flex items-baseline gap-1 text-[13px] tabular-nums">
        <span className="font-semibold">{formatCount(row.sentCount)}</span>
        <span className="text-muted-foreground">of {formatCount(row.targetCount)} sent</span>
      </div>
      <div
        className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-fog"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.fraction * 100)}
        aria-label="Delivery"
      >
        <div className="h-full bg-green transition-[width] duration-700 ease-soft" style={{ width: `${sentPct}%` }} />
        <div className="h-full bg-orange transition-[width] duration-700 ease-soft" style={{ width: `${otherPct}%` }} />
      </div>
    </div>
  );
}

function BroadcastList({ rows, timeZone }: { rows: BroadcastRow[]; timeZone: string }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("ALL");

  const counts = React.useMemo(() => {
    const map = new Map<StatusFilter, number>([["ALL", rows.length]]);
    for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "ALL" || r.status === status) && (!q || r.name.toLowerCase().includes(q) || channelLabel(r.channel).toLowerCase().includes(q)));
  }, [rows, query, status]);

  return (
    <>
      <div className="mb-5 flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="rounded-full pl-10" aria-label="Search broadcasts" />
        </div>
        <FilterMenu
          label="Status"
          value={status}
          onChange={setStatus}
          defaultValue="ALL"
          align="start"
          options={FILTERS.filter((f) => f.value === "ALL" || (counts.get(f.value) ?? 0) > 0 || f.value === status).map((f) => ({
            value: f.value,
            label: f.label,
            count: counts.get(f.value) ?? 0,
            dot: f.dot,
          }))}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-fog px-5 py-10 text-center text-[14px] text-muted-foreground">Nothing matches.</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border">
          {filtered.map((row, i) => {
            const meta = statusMeta(row.status);
            const when = whenLabel(row, timeZone);
            return (
              <li
                key={row.id}
                className="rise group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-4 transition-colors last:border-b-0 hover:bg-fog/60 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] md:px-5"
                style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformMark platform={row.channel.platform} size={32} />
                  <div className="min-w-0">
                    <Link href={`/broadcasts/${row.id}`} className="block truncate text-[14px] font-semibold text-ink after:absolute after:inset-0 hover:underline">
                      {row.name}
                    </Link>
                    <p className="truncate text-[12px] text-muted-foreground" title={summarizeAudience(row.audience)}>
                      {channelLabel(row.channel)} · {audienceLabel(row)}
                    </p>
                  </div>
                </div>
                <div className="hidden md:block">
                  <Badge variant={meta.variant} dot={meta.live ? "pulse" : undefined}>
                    {meta.label}
                  </Badge>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <Delivery row={row} />
                </div>
                <div className="hidden md:block">
                  <p className="brand-label text-muted-foreground">{when.label}</p>
                  <p className="mt-0.5 text-[13px] tabular-nums">{when.value}</p>
                </div>
                <div className="relative z-10 col-start-2 row-start-1 flex items-center gap-2 md:col-start-auto md:row-start-auto">
                  <Badge variant={meta.variant} dot={meta.live ? "pulse" : undefined} className="md:hidden">
                    {meta.label}
                  </Badge>
                  <BroadcastActions row={row} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export { BroadcastList };
