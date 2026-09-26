"use client";

import Link from "next/link";
import * as React from "react";
import { CalendarRange, ChevronDown, Download, ScrollText, Search, SearchX, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterMenu } from "@/components/ui/filter-menu";
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
import { KIND_LABELS, KIND_ORDER, STATUS_ORDER, STATUS_SHORT_LABELS, type StatusBadgeVariant, isSkipStatus, statusVariant } from "./labels";
import { LogRow } from "./log-row";
import { SkipHelpPopover } from "./skip-help-popover";

const ALL = "all";
const SEARCH_DEBOUNCE_MS = 300;

/** Filter controls share one pill shape; on a phone they pair up two to a row. */
const PILL = "h-9 w-[calc(50%-4px)] rounded-full px-3.5 text-[13px] sm:w-auto";

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
        <Button
          type="button"
          variant="outline"
          className={cn(PILL, "min-w-0 justify-start gap-1.5 font-medium", active ? "border-ink/40" : "text-muted-foreground")}
        >
          <CalendarRange />
          <span className="min-w-0 truncate">{rangeLabel(from, to)}</span>
          <ChevronDown className="ml-auto opacity-60 sm:ml-0" />
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

/** The colour of each status, as the dot beside it in the filter menu. */
const STATUS_DOT: Record<StatusBadgeVariant, string> = {
  success: "bg-green",
  destructive: "bg-destructive",
  secondary: "bg-mute/50",
  yellow: "bg-yellow ring-1 ring-inset ring-ink/20",
};

/** A filter that arrived from another page (a broadcast report, a contact), shown so it can be taken off. */
function FromLinkChip({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-9 items-center gap-1 rounded-full bg-lavender-soft pl-3.5 pr-1 text-[13px] font-semibold text-lavender-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="flex h-7 w-7 items-center justify-center rounded-full outline-none transition-colors hover:bg-lavender/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Label htmlFor="logs-search" className="sr-only">
              Search by username
            </Label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="logs-search"
              value={filters.q}
              onChange={(e) => patch({ q: e.target.value })}
              placeholder="Search @username"
              className="h-9 rounded-full pl-9 text-[13px]"
              autoComplete="off"
            />
          </div>

          <FilterMenu
            label="Status"
            value={filters.status || ALL}
            onChange={(v) => patch({ status: v === ALL ? "" : (v as LogFilterState["status"]) })}
            defaultValue={ALL}
            align="start"
            options={[
              { value: ALL, label: "All", count: stats.total },
              ...visibleStatuses.map((status) => ({
                value: status,
                label: STATUS_SHORT_LABELS[status],
                count: stats.byStatus[status],
                dot: STATUS_DOT[statusVariant(status)],
              })),
            ]}
          />

          <Select value={filters.kind || ALL} onValueChange={(v) => patch({ kind: v === ALL ? "" : (v as LogFilterState["kind"]) })}>
            <SelectTrigger className={cn(PILL, "sm:w-[160px]", filters.kind && "border-ink/40")} aria-label="Type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {KIND_ORDER.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {options.channels.length > 1 ? (
            <Select value={filters.channelId || ALL} onValueChange={(v) => patch({ channelId: v === ALL ? "" : v })}>
              <SelectTrigger className={cn(PILL, "sm:w-[170px]", filters.channelId && "border-ink/40")} aria-label="Account">
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
              <SelectTrigger className={cn(PILL, "sm:w-[190px]", filters.automationId && "border-ink/40")} aria-label="Automation">
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
            <FromLinkChip label="One broadcast" removeLabel="Remove broadcast filter" onRemove={() => patch({ broadcastId: "" })} />
          ) : null}
          {filters.contactId ? <FromLinkChip label="One contact" removeLabel="Remove contact filter" onRemove={() => patch({ contactId: "" })} /> : null}

          {filtered ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(EMPTY_LOG_FILTERS)}>
              <X />
              Clear
            </Button>
          ) : null}
        </div>

        {items.length === 0 && !loading ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              tone="lavender"
              title="Nothing matches these filters"
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => setFilters(EMPTY_LOG_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ScrollText}
              tone="lavender"
              title="Nothing sent yet"
              description="Turn on an automation to start sending."
              action={
                <Button size="sm" asChild>
                  <Link href="/automations">Go to automations</Link>
                </Button>
              }
            />
          )
        ) : (
          <div className={cn("overflow-hidden rounded-2xl border bg-card transition-opacity duration-200", loading && "opacity-60")} aria-busy={loading}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8 pr-0">
                    <span className="sr-only">Expand</span>
                  </TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Recipient</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Sent by</TableHead>
                  <TableHead className="hidden xl:table-cell">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <LogRow key={item.id} item={item} index={i} timezone={timezone} expanded={expanded.has(item.id)} onToggle={toggleExpanded} />
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
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
