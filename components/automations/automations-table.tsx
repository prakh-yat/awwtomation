"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AutomationStatus, TriggerType } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { BarChart3, ChevronRight, Copy, LayoutTemplate, MoreHorizontal, Pencil, Plug, Search, SearchX, Trash2, Workflow } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { AutomationStatusBadge, TriggerBadge } from "@/components/automations/badges";
import { ChannelLabel } from "@/components/automations/channel-label";
import { NewAutomationButton } from "@/components/automations/new-automation-button";
import { useOpenTemplates } from "@/components/automations/templates-launcher";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterMenu } from "@/components/ui/filter-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AutomationDetail, AutomationListItem, ChannelOption } from "@/lib/services/automations";
import { cn, formatNumber } from "@/lib/utils";

export type AutomationsTableProps = {
  automations: AutomationListItem[];
  channels: ChannelOption[];
  filters: { q: string; channelId: string; status: string };
  /** Per-status totals for the tabs (within the channel filter, ignoring search). */
  statusCounts: Record<AutomationStatus, number>;
  /** Whether the workspace has any automation at all, whatever the filters. */
  hasAny: boolean;
  /** Account a blank automation starts on; null when none is connected. */
  firstActiveChannelId: string | null;
};

type StatusFilterValue = "" | AutomationStatus;

/** Each status with its badge colour, as the dot beside it in the filter menu. */
const STATUS_TABS: Array<{ value: StatusFilterValue; label: string; dot?: string }> = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active", dot: "bg-green" },
  { value: "PAUSED", label: "Paused", dot: "bg-yellow ring-1 ring-inset ring-ink/20" },
  { value: "DRAFT", label: "Drafts", dot: "bg-mute/50" },
];

/** Stands in for "every status": Radix menus can't represent an empty value. */
const ALL_STATUSES = "ALL";

const ALL_CHANNELS = "__all__";

const ANY_LABEL: Record<TriggerType, string> = { COMMENT: "Any comment", DM: "Any DM", STORY_REPLY: "Any story reply" };

/** Stagger for the `rise` entrance, capped so a long list does not keep the last rows waiting. */
function riseStyle(index: number): React.CSSProperties {
  return { "--i": Math.min(index, 12) } as React.CSSProperties;
}

function lastRun(at: string | null): string {
  return at ? formatDistanceToNowStrict(new Date(at), { addSuffix: true }) : "Never";
}

/** The trigger as a coloured chip, then up to three keywords and the post limit. */
function TriggerSummary({ item, className }: { item: AutomationListItem; className?: string }) {
  const any = item.matchMode === "ANY";
  const keywords = any ? [] : item.keywords;
  const shown = keywords.slice(0, 3);
  const extra = keywords.length - shown.length;
  const posts =
    item.triggerType === "COMMENT" && item.postCount > 0 ? (item.postCount === 1 ? "on 1 post" : `on ${item.postCount} posts`) : null;
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      <TriggerBadge trigger={item.triggerType} label={any ? ANY_LABEL[item.triggerType] : undefined} />
      {shown.map((keyword, i) => (
        <span key={`${keyword}-${i}`} className="max-w-[9rem] truncate rounded-full border bg-background px-2 py-px text-[11px] font-semibold leading-4 text-ink">
          {keyword}
        </span>
      ))}
      {extra > 0 ? <span className="px-0.5 text-[11px] font-semibold text-muted-foreground">+{extra}</span> : null}
      {posts ? <span className="px-0.5 text-[11px] text-muted-foreground">{posts}</span> : null}
    </div>
  );
}

function RowMenu({ item, onDuplicate, onDelete }: { item: AutomationListItem; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-ink data-[state=open]:bg-fog data-[state=open]:text-ink"
          aria-label={`Actions for ${item.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={`/automations/${item.id}`}>
            <Pencil /> Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/automations/${item.id}/analytics`}>
            <BarChart3 /> Analytics
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Small number with its label, for the phone layout where there are no column headers. */
function MiniStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      {/* "Last run" is relative time, which can tick over between the server render and hydration. */}
      <p suppressHydrationWarning className={cn("truncate text-[15px] font-semibold leading-none tabular-nums", muted ? "text-muted-foreground" : "text-ink")}>
        {value}
      </p>
      <p className="brand-label mt-1.5 truncate text-muted-foreground">{label}</p>
    </div>
  );
}

export function AutomationsTable({ automations, channels, filters, statusCounts, hasAny, firstActiveChannelId }: AutomationsTableProps) {
  const openTemplates = useOpenTemplates();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const [search, setSearch] = React.useState(filters.q);
  // Optimistic status per row so the switch flips instantly; cleared on refresh.
  const [statusOverride, setStatusOverride] = React.useState<Record<string, AutomationStatus>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AutomationListItem | null>(null);

  const setParam = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      // A transition keeps the current table on screen while the server re-renders.
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => setParam("q", search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, filters.q, setParam]);

  React.useEffect(() => {
    // Server data caught up with the optimistic state: drop the overrides.
    setStatusOverride({});
  }, [automations]);

  async function toggleStatus(item: AutomationListItem, on: boolean) {
    const next: AutomationStatus = on ? "ACTIVE" : "PAUSED";
    setStatusOverride((s) => ({ ...s, [item.id]: next }));
    setBusyId(item.id);
    try {
      await apiFetch<{ automation: AutomationDetail }>(`/api/automations/${item.id}/status`, { method: "POST", json: { status: next } });
      toast.success(next === "ACTIVE" ? `“${item.name}” is on` : `“${item.name}” is paused`);
      router.refresh();
    } catch (err) {
      setStatusOverride((s) => ({ ...s, [item.id]: item.status }));
      toast.error(errorMessage(err, "Couldn't change the status"));
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(item: AutomationListItem) {
    try {
      const { automation } = await apiFetch<{ automation: AutomationDetail }>(`/api/automations/${item.id}/duplicate`, { method: "POST" });
      toast.success(`Duplicated as “${automation.name}”`, {
        action: { label: "Open", onClick: () => router.push(`/automations/${automation.id}`) },
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't duplicate it"));
    }
  }

  async function remove(item: AutomationListItem) {
    try {
      await apiFetch(`/api/automations/${item.id}`, { method: "DELETE" });
      toast.success(`Deleted “${item.name}”`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete it"));
      throw err;
    }
  }

  function clearFilters() {
    setSearch("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  /** A click anywhere on a row opens it, unless it landed on one of the row's own controls. */
  function openFromRow(event: React.MouseEvent<HTMLElement>, href: string) {
    const target = event.target as Element;
    // Menus render in a portal: their clicks bubble through React to the row without being inside it.
    if (!event.currentTarget.contains(target)) return;
    if (target.closest("a, button, input, [role='switch'], [role='menuitem']")) return;
    // Selecting a name to copy it is not a request to open it.
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
    else router.push(href);
  }

  const counts: Record<StatusFilterValue, number> = {
    "": statusCounts.ACTIVE + statusCounts.PAUSED + statusCounts.DRAFT,
    ACTIVE: statusCounts.ACTIVE,
    PAUSED: statusCounts.PAUSED,
    DRAFT: statusCounts.DRAFT,
  };
  const isFiltered = Boolean(filters.q || filters.channelId || filters.status);
  const showAccount = channels.length > 1;
  const activeTab: StatusFilterValue = STATUS_TABS.find((t) => t.value === filters.status)?.value ?? "";

  if (!hasAny) {
    return (
      <EmptyState
        tone="purple"
        icon={Workflow}
        title="Create your first automation"
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {firstActiveChannelId ? (
              <>
                {openTemplates ? (
                  <Button onClick={openTemplates}>
                    <LayoutTemplate /> Start from a template
                  </Button>
                ) : null}
                <NewAutomationButton channelId={firstActiveChannelId} label="Start from scratch" variant="outline" />
              </>
            ) : (
              // Nothing can be created without an account, so that comes first.
              <>
                <Button variant="highlight" asChild>
                  <Link href="/dashboard?accounts=1">
                    <Plug /> Connect account
                  </Link>
                </Button>
                {openTemplates ? (
                  <Button variant="outline" onClick={openTemplates}>
                    <LayoutTemplate /> Browse templates
                  </Button>
                ) : null}
              </>
            )}
          </div>
        }
      />
    );
  }

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-70")} aria-busy={pending || undefined}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or keyword"
            aria-label="Search automations"
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          {showAccount ? (
            <Select value={filters.channelId || ALL_CHANNELS} onValueChange={(v) => setParam("channel", v === ALL_CHANNELS ? "" : v)}>
              <SelectTrigger className="min-w-0 flex-1 sm:w-60 sm:flex-none" aria-label="Filter by account">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CHANNELS}>All accounts</SelectItem>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <ChannelLabel channel={c} size={16} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <FilterMenu
            label="Status"
            align="start"
            value={activeTab || ALL_STATUSES}
            onChange={(value) => setParam("status", value === ALL_STATUSES ? "" : value)}
            defaultValue={ALL_STATUSES}
            options={STATUS_TABS.map((tab) => ({ value: tab.value || ALL_STATUSES, label: tab.label, count: counts[tab.value], dot: tab.dot }))}
          />
        </div>
      </div>

      {automations.length === 0 ? (
        <EmptyState
          compact
          tone="purple"
          icon={SearchX}
          title="No automations match"
          action={
            isFiltered ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Automation</TableHead>
                  {showAccount ? <TableHead className="hidden w-[200px] lg:table-cell">Account</TableHead> : null}
                  <TableHead className="w-[100px] whitespace-nowrap text-right">DMs · 7d</TableHead>
                  <TableHead className="w-[112px] whitespace-nowrap text-right">Clicks · 7d</TableHead>
                  <TableHead className={cn("hidden w-[140px] pl-6", showAccount ? "xl:table-cell" : "lg:table-cell")}>Last run</TableHead>
                  <TableHead className="w-[150px] pl-6">Status</TableHead>
                  <TableHead className="w-[84px] pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.map((item, i) => {
                  const status = statusOverride[item.id] ?? item.status;
                  const href = `/automations/${item.id}`;
                  return (
                    <TableRow key={item.id} className="rise group cursor-pointer" style={riseStyle(i)} onClick={(e) => openFromRow(e, href)}>
                      {/* max-w-0 lets the name truncate inside the column the table gives it. */}
                      <TableCell className="w-full max-w-0 py-3.5 pl-5">
                        <Link
                          href={href}
                          className="block w-fit max-w-full truncate rounded-md text-[14px] font-semibold text-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {item.name}
                        </Link>
                        <TriggerSummary item={item} className="mt-1.5" />
                      </TableCell>
                      {showAccount ? (
                        <TableCell className="hidden max-w-[200px] text-muted-foreground lg:table-cell">
                          <ChannelLabel channel={item.channel} size={20} />
                        </TableCell>
                      ) : null}
                      <TableCell className={cn("text-right text-[14px] tabular-nums", item.sent7d === 0 ? "text-muted-foreground" : "font-semibold text-ink")}>
                        {formatNumber(item.sent7d)}
                      </TableCell>
                      <TableCell className={cn("text-right text-[14px] tabular-nums", item.clicks7d === 0 ? "text-muted-foreground" : "font-semibold text-ink")}>
                        {formatNumber(item.clicks7d)}
                      </TableCell>
                      <TableCell className={cn("hidden whitespace-nowrap pl-6 text-muted-foreground", showAccount ? "xl:table-cell" : "lg:table-cell")}>
                        <span suppressHydrationWarning>{lastRun(item.lastTriggeredAt)}</span>
                      </TableCell>
                      <TableCell className="pl-6">
                        <div className="flex items-center justify-between gap-3">
                          {status === "DRAFT" ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link href={href} className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <AutomationStatusBadge status="DRAFT" />
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>Finish it in the builder to turn it on</TooltipContent>
                            </Tooltip>
                          ) : (
                            <>
                              <AutomationStatusBadge status={status} />
                              <Switch
                                checked={status === "ACTIVE"}
                                disabled={busyId === item.id}
                                onCheckedChange={(on) => toggleStatus(item, on)}
                                aria-label={status === "ACTIVE" ? `Pause ${item.name}` : `Turn on ${item.name}`}
                              />
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-0.5">
                          <RowMenu item={item} onDuplicate={() => void duplicate(item)} onDelete={() => setDeleteTarget(item)} />
                          {/* The name is the keyboard path in; this is only the visible cue that the row opens. */}
                          <ChevronRight
                            aria-hidden
                            className="h-4 w-4 text-muted-foreground/40 transition-[color,transform] duration-200 ease-soft group-hover:text-ink motion-safe:group-hover:translate-x-0.5"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2.5 md:hidden">
            {automations.map((item, i) => {
              const status = statusOverride[item.id] ?? item.status;
              return (
                <li key={item.id} className="rise" style={riseStyle(i)}>
                  {/* The name's link covers the card; the switch and the menu sit above it. */}
                  <div className="lift relative rounded-2xl border bg-card p-4 hover:border-ink/25">
                    <div className="flex items-center justify-between gap-3">
                      <AutomationStatusBadge status={status} />
                      <div className="relative z-10 -my-1 -mr-1.5 flex items-center gap-1.5">
                        {status === "DRAFT" ? null : (
                          <Switch
                            checked={status === "ACTIVE"}
                            disabled={busyId === item.id}
                            onCheckedChange={(on) => toggleStatus(item, on)}
                            aria-label={status === "ACTIVE" ? `Pause ${item.name}` : `Turn on ${item.name}`}
                          />
                        )}
                        <RowMenu item={item} onDuplicate={() => void duplicate(item)} onDelete={() => setDeleteTarget(item)} />
                      </div>
                    </div>
                    <Link
                      href={`/automations/${item.id}`}
                      className="mt-2 block truncate text-[15px] font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                      {item.name}
                    </Link>
                    <TriggerSummary item={item} className="mt-1.5" />
                    {showAccount ? <ChannelLabel channel={item.channel} size={16} className="mt-2 text-[12px] text-muted-foreground" /> : null}
                    <div className="mt-3.5 grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-6 border-t pt-3">
                      <MiniStat label="DMs · 7d" value={formatNumber(item.sent7d)} muted={item.sent7d === 0} />
                      <MiniStat label="Clicks · 7d" value={formatNumber(item.clicks7d)} muted={item.clicks7d === 0} />
                      <MiniStat label="Last run" value={lastRun(item.lastTriggeredAt)} muted={!item.lastTriggeredAt} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmDialog
        trigger={null}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete “${deleteTarget.name}”?` : "Delete automation?"}
        description="It stops replying straight away, even mid-conversation. Past messages stay in Logs."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await remove(deleteTarget);
        }}
      />
    </div>
  );
}
