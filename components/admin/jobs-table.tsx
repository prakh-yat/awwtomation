"use client";

import * as React from "react";
import Link from "next/link";
import type { JobStatus, JobType } from "@prisma/client";
import { ChevronDown, ChevronRight, ListChecks, Pause, Play, RefreshCw, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdminJobRow, AdminJobsPage } from "@/lib/services/admin";
import { cn, formatNumber } from "@/lib/utils";

import { adminFetch } from "./api";
import { humanize, JOB_STATUSES, JOB_TYPE_LABELS, JOB_TYPES } from "./constants";
import { formatUtc, hrefWith, prettyJson, truncateText } from "./format";
import { JobStatusBadge } from "./status-badge";
import { TimeAgo } from "./time-ago";

const ALL = "ALL";
const REFRESH_MS = 10_000;

export type JobFilters = { status: JobStatus | null; type: JobType | null };

function canRetry(job: AdminJobRow): boolean {
  return job.status === "FAILED" || job.status === "CANCELLED";
}

function canCancel(job: AdminJobRow): boolean {
  return job.status === "PENDING" || job.status === "FAILED";
}

function Detail({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-all text-right", mono && "font-mono")}>{value}</span>
    </div>
  );
}

/**
 * Self-contained queue browser. The server page seeds it with the first
 * page; afterwards it talks to /api/admin/jobs directly and mirrors the
 * filters into the URL (replaceState, so no server round-trip).
 */
export function JobsTable({ initial, initialFilters }: { initial: AdminJobsPage; initialFilters: JobFilters }) {
  const [filters, setFilters] = React.useState<JobFilters>(initialFilters);
  const [items, setItems] = React.useState<AdminJobRow[]>(initial.items);
  const [nextCursor, setNextCursor] = React.useState(initial.nextCursor);
  const [stats, setStats] = React.useState(initial.stats);
  const [total, setTotal] = React.useState(initial.total);
  const [pages, setPages] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [auto, setAuto] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  // The interval reads the latest filters without re-subscribing on every change.
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  const load = React.useCallback(async (f: JobFilters, silent: boolean) => {
    setLoading(true);
    try {
      const data = await adminFetch<AdminJobsPage>(hrefWith("/api/admin/jobs", { status: f.status, type: f.type }));
      setItems(data.items);
      setNextCursor(data.nextCursor);
      setStats(data.stats);
      setTotal(data.total);
      setPages(1);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Could not load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  function updateFilters(next: JobFilters) {
    setFilters(next);
    setExpanded(null);
    window.history.replaceState(null, "", hrefWith("/admin/jobs", { status: next.status, type: next.type }));
    void load(next, false);
  }

  const paged = pages > 1;
  React.useEffect(() => {
    // Refreshing would drop the extra pages the admin scrolled through, so pause while paging.
    if (!auto || paged) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(filtersRef.current, true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, paged, load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await adminFetch<AdminJobsPage>(
        hrefWith("/api/admin/jobs", { status: filters.status, type: filters.type, cursor: nextCursor }),
      );
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
      setStats(data.stats);
      setTotal(data.total);
      setPages((p) => p + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load more jobs");
    } finally {
      setLoadingMore(false);
    }
  }

  /** Throws on failure so a wrapping ConfirmDialog stays open; plain buttons catch it. */
  async function act(job: AdminJobRow, action: "retry" | "cancel") {
    setBusyId(job.id);
    try {
      const { job: updated } = await adminFetch<{ job: AdminJobRow }>(`/api/admin/jobs/${job.id}/${action}`, { method: "POST" });
      setItems((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      toast.success(action === "retry" ? "Job re-queued" : "Job cancelled");
      void load(filtersRef.current, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not ${action} job`);
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  const chips: Array<{ status: JobStatus; count: number; hint?: string }> = [
    { status: "PENDING", count: stats.PENDING, hint: `${formatNumber(stats.due)} due` },
    { status: "PROCESSING", count: stats.PROCESSING },
    { status: "FAILED", count: stats.FAILED },
    { status: "COMPLETED", count: stats.COMPLETED },
    { status: "CANCELLED", count: stats.CANCELLED },
  ];
  const hasFilters = filters.status !== null || filters.type !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const active = filters.status === c.status;
          return (
            <button
              key={c.status}
              type="button"
              onClick={() => updateFilters({ ...filters, status: active ? null : c.status })}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground shadow-card hover:text-foreground",
              )}
            >
              <span className="font-medium">{humanize(c.status)}</span>
              <span className="tabular-nums">{formatNumber(c.count)}</span>
              {c.hint ? <span className={cn("text-xs", active ? "text-background/70" : "text-muted-foreground")}>({c.hint})</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={filters.status ?? ALL} onValueChange={(v) => updateFilters({ ...filters, status: v === ALL ? null : (v as JobStatus) })}>
            <SelectTrigger className="sm:w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {JOB_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.type ?? ALL} onValueChange={(v) => updateFilters({ ...filters, type: v === ALL ? null : (v as JobType) })}>
            <SelectTrigger className="sm:w-48" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {JOB_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {JOB_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => updateFilters({ status: null, type: null })}>
              <X />
              Clear
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span suppressHydrationWarning>{updatedAt ? `Updated ${formatUtc(updatedAt).slice(11)}` : "Live"}</span>
          <Button variant="ghost" size="sm" onClick={() => setAuto((v) => !v)} aria-pressed={auto} title={paged ? "Paused while paging" : undefined}>
            {auto && !paged ? <Pause /> : <Play />}
            {auto ? (paged ? "Paused (paging)" : "Auto-refresh on") : "Auto-refresh off"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load(filters, false)} loading={loading}>
            {loading ? null : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={hasFilters ? "No jobs match these filters" : "The queue is empty"}
          description={
            hasFilters
              ? "Try a different status or type."
              : "Jobs appear here when comments, DMs, broadcasts or token refreshes are processed."
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={() => updateFilters({ status: null, type: null })}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Run at</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((job) => {
                const open = expanded === job.id;
                const busy = busyId === job.id;
                return (
                  <React.Fragment key={job.id}>
                    <TableRow className={cn(open && "bg-muted/40")}>
                      <TableCell className="pr-0">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : job.id)}
                          aria-expanded={open}
                          aria-label={open ? "Hide details" : "Show details"}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{JOB_TYPE_LABELS[job.type]}</p>
                        {job.dedupeKey ? <p className="truncate font-mono text-[11px] text-muted-foreground" title={job.dedupeKey}>{truncateText(job.dedupeKey, 40)}</p> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <JobStatusBadge status={job.status} />
                          {job.status === "PROCESSING" && job.lockedBy ? (
                            <span className="truncate font-mono text-[11px] text-muted-foreground" title={job.lockedBy}>
                              {truncateText(job.lockedBy, 18)}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {job.workspace ? (
                          <Link href={`/admin/workspaces/${job.workspace.id}`} className="underline-offset-4 hover:underline">
                            {job.workspace.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {job.attempts}/{job.maxAttempts}
                      </TableCell>
                      <TableCell>
                        <TimeAgo iso={job.runAt} />
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        {job.lastError ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block cursor-help truncate font-mono text-xs text-destructive">{truncateText(job.lastError, 48)}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-md whitespace-pre-wrap break-words font-mono text-[11px]">
                              {job.lastError}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canRetry(job) ? (
                            <Button variant="outline" size="sm" loading={busy} onClick={() => act(job, "retry").catch(() => undefined)}>
                              {busy ? null : <RotateCcw />}
                              Retry
                            </Button>
                          ) : null}
                          {canCancel(job) ? (
                            <ConfirmDialog
                              trigger={
                                <Button variant="ghost" size="sm" disabled={busy}>
                                  Cancel
                                </Button>
                              }
                              title="Cancel this job?"
                              description={`The ${JOB_TYPE_LABELS[job.type].toLowerCase()} job will not run. You can retry it later from this table.`}
                              confirmLabel="Cancel job"
                              cancelLabel="Keep"
                              destructive
                              onConfirm={() => act(job, "cancel")}
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="py-3">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Payload</p>
                              <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed">
                                {prettyJson(job.payload)}
                              </pre>
                            </div>
                            <div className="divide-y">
                              <Detail label="Job id" value={job.id} />
                              <Detail label="Dedupe key" value={job.dedupeKey ?? "—"} />
                              <Detail label="Created" value={formatUtc(job.createdAt)} mono={false} />
                              <Detail label="Updated" value={formatUtc(job.updatedAt)} mono={false} />
                              <Detail label="Locked at" value={formatUtc(job.lockedAt)} mono={false} />
                              <Detail label="Locked by" value={job.lockedBy ?? "—"} />
                              {job.lastError ? <Detail label="Last error" value={job.lastError} /> : null}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              Showing {formatNumber(items.length)} of {formatNumber(total)} jobs
            </span>
            {nextCursor ? (
              <Button variant="outline" size="sm" onClick={() => void loadMore()} loading={loadingMore}>
                Load more
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
