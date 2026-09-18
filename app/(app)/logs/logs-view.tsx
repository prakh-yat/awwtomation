"use client";

import Link from "next/link";
import * as React from "react";
import { CalendarRange, ChevronDown, Download, ScrollText, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DeliveryLogItem, LogFilterOptions, LogStats } from "@/lib/services/logs";
import { cn, formatNumber } from "@/lib/utils";

import { errorMessage, logsApi } from "./api";
import { EMPTY_LOG_FILTERS, hasActiveLogFilters, type LogFilterState, logFiltersToSearchParams } from "./filters";
import { todayKey } from "./format";
import { KIND_LABELS, KIND_ORDER, STATUS_LABELS, STATUS_ORDER, STATUS_SHORT_LABELS, isSkipStatus, statusVariant } from "./labels";
import { LogRow } from "./log-row";
import { SkipHelpPopover } from "./skip-help-popover";

const ALL = "all";
const SEARCH_DEBOUNCE_MS = 300;

export interface LogsViewProps {
  initialItems: DeliveryLogItem[];
  initialCursor: string | null;
  initialStats: LogStats;
  initialFilters: LogFilterState;
  options: LogFilterOptions;
  timezone: string;
}

function filtersKey(f: LogFilterState): string {
  return logFiltersToSearchParams(f).toString();
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** "Sep 1": the filter stores YYYY-MM-DD days in the workspace time zone, so read them back as plain dates. */
function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const sameYear = y === new Date().getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function rangeLabel(from: string, to: string): string {
  if (from && to) return from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
  if (from) return `From ${dayLabel(from)}`;
  if (to) return `Until ${dayLabel(to)}`;
  return "Any date";
}

function DateRangeFilter({ from, to, max, onChange }: { from: string; to: string; max: string; onChange: (range: { from: string; to: string }) => void }) {
  const [open, setOpen] = React.useState(false);
  const [draftFrom, setDraftFrom] = React.useState(from);
  const [draftTo, setDraftTo] = React.useState(to);
  const active = Boolean(from || to);

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftFrom(from);
      setDraftTo(to);
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn("h-8 gap-1.5 text-[13px] font-normal", !active && "text-muted-foreground")}>
          <CalendarRange className="h-3.5 w-3.5" />
          {rangeLabel(from, to)}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const swap = draftFrom && draftTo && draftFrom > draftTo;
            onChange(swap ? { from: draftTo, to: draftFrom } : { from: draftFrom, to: draftTo });
            setOpen(false);
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="logs-from">From</Label>
              <Input id="logs-from" type="date" value={draftFrom} max={draftTo || max} onChange={(e) => setDraftFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logs-to">To</Label>
              <Input id="logs-to" type="date" value={draftTo} min={draftFrom || undefined} max={max} onChange={(e) => setDraftTo(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Leave one side empty to keep the range open.</p>
          <div className="flex gap-2">
            {active ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  onChange({ from: "", to: "" });
                  setOpen(false);
                }}
              >
                Clear dates
              </Button>
            ) : null}
            <Button type="submit" size="sm" className="flex-1">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function StatusChip({ active, label, count, variant, onClick }: { active: boolean; label: string; count: number; variant?: "success" | "destructive" | "secondary"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent",
      )}
    >
      {variant && !active ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            variant === "success" && "bg-success",
            variant === "destructive" && "bg-destructive",
            variant === "secondary" && "bg-muted-foreground/50",
          )}
          aria-hidden
        />
      ) : null}
      {label}
      <span className={cn("tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground")}>{formatNumber(count)}</span>
    </button>
  );
}

export function LogsView({ initialItems, initialCursor, initialStats, initialFilters, options, timezone }: LogsViewProps) {
  const [filters, setFilters] = React.useState<LogFilterState>(initialFilters);
  const [items, setItems] = React.useState<DeliveryLogItem[]>(initialItems);
  const [nextCursor, setNextCursor] = React.useState<string | null>(initialCursor);
  const [stats, setStats] = React.useState<LogStats>(initialStats);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  // Search is typed continuously; everything else changes discretely. Only
  // the text input is debounced so selects still feel instant.
  const debouncedQ = useDebounced(filters.q, SEARCH_DEBOUNCE_MS);
  const effective = React.useMemo<LogFilterState>(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
  const effectiveKey = filtersKey(effective);
  // The key whose rows are currently on screen. Set only once a fetch lands,
  // so an aborted request (StrictMode re-run, rapid filter changes) is retried
  // rather than treated as done.
  const loadedKey = React.useRef(filtersKey(initialFilters));

  React.useEffect(() => {
    if (effectiveKey === loadedKey.current) return;

    // Keep the URL shareable without a server round-trip: Next's router
    // listens to replaceState, so useSearchParams elsewhere stays in sync.
    const url = effectiveKey ? `${window.location.pathname}?${effectiveKey}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);

    const controller = new AbortController();
    setLoading(true);

    logsApi
      .list(effective, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        loadedKey.current = effectiveKey;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        if (page.stats) setStats(page.stats);
        setExpanded(new Set());
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        toast.error(errorMessage(err, "Couldn't load logs"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [effective, effectiveKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await logsApi.list(effective, { cursor: nextCursor });
      setItems((prev) => {
        // A row written between two pages would repeat; keyset paging makes it unlikely, dedupe makes it impossible.
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load more logs"));
    } finally {
      setLoadingMore(false);
    }
  }

  function patch(next: Partial<LogFilterState>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = hasActiveLogFilters(filters);
  const maxDay = todayKey(timezone);
  const exportUrl = logsApi.exportUrl(effective);
  const canExport = stats.total > 0 || items.length > 0;

  const visibleStatuses = STATUS_ORDER.filter((s) => !isSkipStatus(s) || stats.byStatus[s] > 0 || filters.status === s);

  return (
    <>
      <PageHeader
        title="Logs"
        actions={
          <>
            <SkipHelpPopover />
            <Button variant="outline" size="sm" asChild={canExport} disabled={!canExport}>
              {canExport ? (
                <a href={exportUrl} download>
                  <Download />
                  Export CSV
                </a>
              ) : (
                <>
                  <Download />
                  Export CSV
                </>
              )}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Label htmlFor="logs-search" className="sr-only">
              Search by username
            </Label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="logs-search"
              value={filters.q}
              onChange={(e) => patch({ q: e.target.value })}
              placeholder="Search @username"
              className="h-8 pl-8 text-[13px]"
              autoComplete="off"
            />
          </div>

          <Select value={filters.status || ALL} onValueChange={(v) => patch({ status: v === ALL ? "" : (v as LogFilterState["status"]) })}>
            <SelectTrigger className="h-8 w-[200px] text-[13px]" aria-label="Status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.kind || ALL} onValueChange={(v) => patch({ kind: v === ALL ? "" : (v as LogFilterState["kind"]) })}>
            <SelectTrigger className="h-8 w-[140px] text-[13px]" aria-label="Kind">
              <SelectValue placeholder="Kind" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All kinds</SelectItem>
              {KIND_ORDER.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {options.channels.length > 1 ? (
            <Select value={filters.channelId || ALL} onValueChange={(v) => patch({ channelId: v === ALL ? "" : v })}>
              <SelectTrigger className="h-8 w-[170px] text-[13px]" aria-label="Channel">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {options.channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.username ? `@${c.username}` : (c.name ?? c.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {options.automations.length > 0 ? (
            <Select value={filters.automationId || ALL} onValueChange={(v) => patch({ automationId: v === ALL ? "" : v })}>
              <SelectTrigger className="h-8 w-[190px] text-[13px]" aria-label="Automation">
                <SelectValue placeholder="Automation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All automations</SelectItem>
                {options.automations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <DateRangeFilter from={filters.from} to={filters.to} max={maxDay} onChange={(range) => patch(range)} />

          {filters.broadcastId ? (
            <Badge variant="outline" className="h-8 gap-1.5 px-2.5">
              Broadcast filter
              <button type="button" onClick={() => patch({ broadcastId: "" })} aria-label="Remove broadcast filter" className="rounded-sm hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ) : null}
          {filters.contactId ? (
            <Badge variant="outline" className="h-8 gap-1.5 px-2.5">
              Contact filter
              <button type="button" onClick={() => patch({ contactId: "" })} aria-label="Remove contact filter" className="rounded-sm hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ) : null}

          {filtered ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(EMPTY_LOG_FILTERS)}>
              <X />
              Clear
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" aria-label="Counts by status">
          <StatusChip active={!filters.status} label="All" count={stats.total} onClick={() => patch({ status: "" })} />
          {visibleStatuses.map((s) => (
            <StatusChip
              key={s}
              active={filters.status === s}
              label={STATUS_SHORT_LABELS[s]}
              count={stats.byStatus[s]}
              variant={statusVariant(s)}
              onClick={() => patch({ status: filters.status === s ? "" : s })}
            />
          ))}
        </div>

        {items.length === 0 && !loading ? (
          filtered ? (
            <EmptyState
              icon={ScrollText}
              title="No logs match these filters"
              description="Try widening the date range or clearing the status filter."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => setFilters(EMPTY_LOG_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ScrollText}
              title="No deliveries yet"
              description="Logs appear the moment an automation sends its first DM or reply. Activate an automation to get started."
              action={
                <Button size="sm" asChild>
                  <Link href="/automations">Go to automations</Link>
                </Button>
              }
            />
          )
        ) : (
          <div className={cn("rounded-lg border bg-card shadow-card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8 pr-0">
                    <span className="sr-only">Expand</span>
                  </TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="hidden sm:table-cell">Recipient</TableHead>
                  <TableHead className="hidden lg:table-cell">Sent by</TableHead>
                  <TableHead className="hidden xl:table-cell">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <LogRow key={item.id} item={item} timezone={timezone} expanded={expanded.has(item.id)} onToggle={toggleExpanded} />
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <span>
                Showing {formatNumber(items.length)}
                {stats.total > items.length && !filters.status ? ` of ${formatNumber(stats.total)}` : ""}
              </span>
              {nextCursor ? (
                <Button type="button" variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                  Load more
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
