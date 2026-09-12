"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChannelPlatform } from "@prisma/client";
import {
  Check,
  ExternalLink,
  Inbox,
  Layers,
  MoreHorizontal,
  Plug,
  Search,
  Tag,
  TagIcon,
  Trash2,
  UserRound,
  UserRoundCheck,
  UserRoundX,
  Users,
  Workflow,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContactChannelSummary, ContactListItem, ContactStats, ContactTagCount } from "@/lib/services/contacts";
import type { SegmentSummary } from "@/lib/services/segments";
import { cn, formatNumber } from "@/lib/utils";

import { contactsApi, errorMessage, segmentsApi } from "./api";
import {
  type ContactFilterState,
  describeSegmentFilters,
  EMPTY_FILTERS,
  filtersEqual,
  filtersToSearchParams,
  hasActiveFilters,
  LAST_INTERACTION_OPTIONS,
  segmentFiltersToState,
} from "./filters";
import { BulkTagDialog } from "./bulk-tag-dialog";
import { ContactAvatar } from "./contact-avatar";
import { ExportCsvButton } from "./export-csv-button";
import { contactDisplayName, contactProfileUrl, formatAbsolute, formatRelative, platformLabel } from "./format";
import { ManageTagsDialog } from "./manage-tags-dialog";
import { SegmentFormDialog } from "./segments-dialog";
import { SegmentsRail, SegmentsSelect } from "./segments-rail";
import { SegmentSaveActions } from "./segments-save";
import { TagChips } from "./tag-chips";
import { TagFilterPopover } from "./tag-filter-popover";

export interface ContactsViewProps {
  initialItems: ContactListItem[];
  initialCursor: string | null;
  initialFilters: ContactFilterState;
  /** Saved segments with live counts (name order). */
  segments: SegmentSummary[];
  /** Segment the page was opened on (`?segment=`), if it exists. */
  activeSegmentId: string | null;
  channels: ContactChannelSummary[];
  tags: ContactTagCount[];
  stats: ContactStats;
  timezone: string;
}

const ALL = "all";
const ANY_TIME = "any";

function uniq(tags: string[]): string[] {
  return Array.from(new Set(tags));
}

function channelLabel(channel: Pick<ContactChannelSummary, "username" | "name">): string {
  return channel.username ? `@${channel.username.replace(/^@/, "")}` : (channel.name ?? "Unnamed channel");
}

function byName(a: SegmentSummary, b: SegmentSummary): number {
  return a.name.localeCompare(b.name);
}

function isPlatform(value: string): value is ChannelPlatform {
  return value === "INSTAGRAM" || value === "FACEBOOK";
}

/**
 * The contacts list. The server renders the first page; every filter change
 * refetches through /api/contacts and mirrors itself into the URL so the
 * view is shareable and the export link always carries the same filters.
 * A selected segment is `?segment=<id>`; once its filters are edited the
 * explicit params are written too, and the toolbar offers to save them back.
 * Stats come straight from props — `router.refresh()` after deletes keeps
 * them honest without disturbing the locally held rows.
 */
function ContactsView({ initialItems, initialCursor, initialFilters, segments: initialSegments, activeSegmentId, channels, tags, stats, timezone }: ContactsViewProps) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<ContactFilterState>(initialFilters);
  const [segments, setSegments] = React.useState<SegmentSummary[]>(initialSegments);
  const [activeId, setActiveId] = React.useState<string | null>(activeSegmentId);
  const [items, setItems] = React.useState<ContactListItem[]>(initialItems);
  const [nextCursor, setNextCursor] = React.useState<string | null>(initialCursor);
  const [tagOptions, setTagOptions] = React.useState<ContactTagCount[]>(tags);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkDialog, setBulkDialog] = React.useState<"add" | "remove" | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ContactListItem | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<SegmentSummary | null>(null);
  const [deleteSegmentTarget, setDeleteSegmentTarget] = React.useState<SegmentSummary | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setTagOptions(tags);
  }, [tags]);

  // Server-rendered segments (and their counts) win after every router.refresh().
  React.useEffect(() => {
    setSegments(initialSegments);
  }, [initialSegments]);

  const activeSegment = React.useMemo(() => segments.find((s) => s.id === activeId) ?? null, [segments, activeId]);
  const dirty = activeSegment ? !filtersEqual(filters, segmentFiltersToState(activeSegment.filters)) : false;

  const refreshTags = React.useCallback(async () => {
    try {
      setTagOptions(await contactsApi.tags());
    } catch {
      // Non-critical: the filter list just goes stale until the next load.
    }
  }, []);

  const refreshSegments = React.useCallback(async () => {
    try {
      setSegments(await segmentsApi.list());
    } catch {
      // Non-critical: counts in the rail go stale until the next load.
    }
  }, []);

  const runQuery = React.useCallback(async (f: ContactFilterState, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await contactsApi.list(f, { signal });
      setItems(res.items);
      setNextCursor(res.nextCursor);
      setSelected(new Set());
    } catch (err) {
      if (signal?.aborted) return;
      toast.error(errorMessage(err, "Couldn't load contacts"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // URL sync: a clean segment is just `?segment=`; edited filters are spelled out so a reload keeps them.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (activeId) params.set("segment", activeId);
    if (!activeId || dirty) {
      for (const [k, v] of filtersToSearchParams(filters)) params.set(k, v);
    }
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filters, activeId, dirty]);

  // Debounced refetch on every filter change. The server already rendered
  // the page for `initialFilters` (same object reference until the user
  // edits something), so that first pass is skipped.
  React.useEffect(() => {
    if (filters === initialFilters) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runQuery(filters, controller.signal), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, initialFilters, runQuery]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await contactsApi.list(filters, { cursor: nextCursor });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(res.nextCursor);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load more contacts"));
    } finally {
      setLoadingMore(false);
    }
  }

  function patch(next: Partial<ContactFilterState>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  /** Clearing every filter also leaves the segment — an empty toolbar means "all contacts". */
  function clearFilters() {
    setActiveId(null);
    setFilters(EMPTY_FILTERS);
    searchRef.current?.focus();
  }

  // ── Segments ──
  function selectSegment(id: string | null) {
    const segment = id ? segments.find((s) => s.id === id) : null;
    setActiveId(segment ? segment.id : null);
    setFilters(segment ? segmentFiltersToState(segment.filters) : EMPTY_FILTERS);
  }

  function resetToSegment() {
    if (activeSegment) setFilters(segmentFiltersToState(activeSegment.filters));
  }

  function onSegmentCreated(segment: SegmentSummary) {
    setSegments((prev) => [...prev.filter((s) => s.id !== segment.id), segment].sort(byName));
    // Filters already match the new segment, so no refetch — only the rail and URL change.
    setActiveId(segment.id);
  }

  function onSegmentUpdated(segment: SegmentSummary) {
    setSegments((prev) => prev.map((s) => (s.id === segment.id ? segment : s)).sort(byName));
  }

  async function renameSegment(values: { name: string; description: string | null }) {
    if (!renameTarget) return;
    const segment = await segmentsApi.update(renameTarget.id, values);
    onSegmentUpdated(segment);
    toast.success(`Renamed to “${segment.name}”`);
  }

  async function deleteSegment() {
    const target = deleteSegmentTarget;
    if (!target) return;
    try {
      await segmentsApi.remove(target.id);
      setSegments((prev) => prev.filter((s) => s.id !== target.id));
      if (activeId === target.id) {
        setActiveId(null);
        setFilters(EMPTY_FILTERS);
      }
      toast.success(`Deleted “${target.name}”`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the segment"));
      throw err;
    }
  }

  // ── Selection ──
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0 && !allSelected;
  const selectedIds = React.useMemo(() => Array.from(selected), [selected]);
  const selectedTagUnion = React.useMemo(
    () => uniq(items.filter((i) => selected.has(i.id)).flatMap((i) => i.tags)).sort((a, b) => a.localeCompare(b)),
    [items, selected],
  );

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(items.map((i) => i.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // ── Mutations ──
  function onBulkTagsApplied({ mode, tags: changed }: { mode: "add" | "remove"; tags: string[] }) {
    setItems((prev) =>
      prev.map((item) =>
        selected.has(item.id)
          ? { ...item, tags: mode === "add" ? uniq([...item.tags, ...changed]) : item.tags.filter((t) => !changed.includes(t)) }
          : item,
      ),
    );
    void refreshTags();
    void refreshSegments();
  }

  async function deleteSelected() {
    const ids = selectedIds;
    try {
      const { deleted } = await contactsApi.removeMany(ids);
      setItems((prev) => prev.filter((i) => !selected.has(i.id)));
      setSelected(new Set());
      toast.success(`Deleted ${deleted} contact${deleted === 1 ? "" : "s"}`);
      router.refresh();
      void refreshTags();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete contacts"));
      throw err;
    }
  }

  async function deleteOne(item: ContactListItem) {
    try {
      await contactsApi.remove(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelected((prev) => {
        if (!prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      toast.success(`Deleted ${contactDisplayName(item)}`);
      router.refresh();
      void refreshTags();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete contact"));
      throw err;
    }
  }

  function onTagsManaged() {
    void runQuery(filters);
    void refreshTags();
    void refreshSegments();
    router.refresh();
  }

  const filtered = hasActiveFilters(filters);
  const workspaceEmpty = stats.total === 0 && !filtered && segments.length === 0;
  const platformCount = new Set(channels.map((c) => c.platform)).size;
  const showPlatform = platformCount > 1 || Boolean(filters.platform);
  const lastInteractionValue = filters.lastInteractionDays ? String(filters.lastInteractionDays) : ANY_TIME;
  const customDays = filters.lastInteractionDays && !LAST_INTERACTION_OPTIONS.some((o) => o.days === filters.lastInteractionDays) ? filters.lastInteractionDays : null;

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Everyone who has commented, messaged or replied to a story on your connected accounts."
        actions={
          <>
            <ExportCsvButton filters={filters} disabled={workspaceEmpty} />
            <ManageTagsDialog tags={tagOptions} onChanged={onTagsManaged} />
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total contacts" value={formatNumber(stats.total)} icon={Users} />
        <StatCard label="New this week" value={formatNumber(stats.newThisWeek)} hint="First seen in the last 7 days" icon={UserRound} />
        <StatCard
          label="Followers"
          value={formatNumber(stats.followers)}
          hint={stats.total > 0 ? `${Math.round((stats.followers / stats.total) * 100)}% of contacts` : "Learned during follow gates"}
          icon={UserRoundCheck}
        />
        <StatCard label="Opted out" value={formatNumber(stats.optedOut)} hint="Never messaged by automations" icon={UserRoundX} />
      </div>

      {workspaceEmpty ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Contacts are created automatically the first time someone comments on, messages or replies to a story on a connected account."
          action={
            channels.length === 0 ? (
              <Button asChild>
                <Link href="/channels">
                  <Plug />
                  Connect a channel
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/automations/new">
                  <Workflow />
                  Create an automation
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="flex items-start gap-6">
          <SegmentsRail
            className="sticky top-6 hidden lg:block"
            segments={segments}
            activeId={activeId}
            totalCount={stats.total}
            onSelect={selectSegment}
            onRename={setRenameTarget}
            onDelete={setDeleteSegmentTarget}
          />

          <div className="min-w-0 flex-1 space-y-3">
            <SegmentsSelect
              className="lg:hidden"
              segments={segments}
              activeId={activeId}
              totalCount={stats.total}
              onSelect={selectSegment}
              onRename={setRenameTarget}
              onDelete={setDeleteSegmentTarget}
            />

            {/* Segment header — which saved view is loaded and whether the toolbar has drifted from it. */}
            {activeSegment ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-card px-3 py-2 shadow-card">
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{activeSegment.name}</span>
                    {dirty ? (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                        Edited
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-[12px] text-muted-foreground" title={describeSegmentFilters(activeSegment.filters)}>
                    {activeSegment.description || describeSegmentFilters(activeSegment.filters)}
                  </p>
                </div>
                <SegmentSaveActions
                  filters={filters}
                  active={activeSegment}
                  dirty={dirty}
                  onCreated={onSegmentCreated}
                  onUpdated={onSegmentUpdated}
                  onReset={resetToSegment}
                />
              </div>
            ) : null}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={filters.q}
                  onChange={(e) => patch({ q: e.target.value })}
                  placeholder="Search name or @username"
                  className="h-8 pl-8 pr-8 text-[13px]"
                  aria-label="Search contacts"
                />
                {filters.q ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => patch({ q: "" })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {channels.length > 1 ? (
                <Select value={filters.channelId || ALL} onValueChange={(v) => patch({ channelId: v === ALL ? "" : v })}>
                  <SelectTrigger className="h-8 w-auto min-w-[10rem] text-[13px]" aria-label="Channel">
                    <SelectValue placeholder="All channels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All channels</SelectItem>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="inline-flex items-center gap-1.5">
                          <PlatformIcon platform={c.platform} size={12} />
                          {channelLabel(c)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {showPlatform ? (
                <Select value={filters.platform || ALL} onValueChange={(v) => patch({ platform: isPlatform(v) ? v : "" })}>
                  <SelectTrigger className="h-8 w-auto min-w-[8rem] text-[13px]" aria-label="Platform">
                    <SelectValue placeholder="All platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All platforms</SelectItem>
                    <SelectItem value="INSTAGRAM">
                      <span className="inline-flex items-center gap-1.5">
                        <PlatformIcon platform="INSTAGRAM" size={12} />
                        Instagram
                      </span>
                    </SelectItem>
                    <SelectItem value="FACEBOOK">
                      <span className="inline-flex items-center gap-1.5">
                        <PlatformIcon platform="FACEBOOK" size={12} />
                        Facebook
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : null}

              <TagFilterPopover options={tagOptions} selected={filters.tags} mode={filters.tagMode} onChange={({ tags: t, mode }) => patch({ tags: t, tagMode: mode })} />
              <TagFilterPopover exclude options={tagOptions} selected={filters.excludeTags} mode="any" onChange={({ tags: t }) => patch({ excludeTags: t })} />

              <Select value={filters.follower} onValueChange={(v) => patch({ follower: v === "yes" ? "yes" : v === "no" ? "no" : "all" })}>
                <SelectTrigger className="h-8 w-auto min-w-[8.5rem] text-[13px]" aria-label="Follower status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everyone</SelectItem>
                  <SelectItem value="yes">Followers</SelectItem>
                  <SelectItem value="no">Not following</SelectItem>
                </SelectContent>
              </Select>

              <Select value={lastInteractionValue} onValueChange={(v) => patch({ lastInteractionDays: v === ANY_TIME ? null : Number(v) })}>
                <SelectTrigger className="h-8 w-auto min-w-[9rem] text-[13px]" aria-label="Last interaction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_TIME}>Any time</SelectItem>
                  {LAST_INTERACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={String(o.days)}>
                      {o.label}
                    </SelectItem>
                  ))}
                  {customDays ? <SelectItem value={String(customDays)}>Last {customDays} days</SelectItem> : null}
                </SelectContent>
              </Select>

              <div className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-[13px] shadow-sm">
                <Switch
                  id="contacts-hide-opted-out"
                  checked={filters.excludeOptedOut}
                  onCheckedChange={(excludeOptedOut) => patch({ excludeOptedOut })}
                  className="scale-90"
                />
                <Label htmlFor="contacts-hide-opted-out" className="cursor-pointer font-normal">
                  Hide opted out
                </Label>
              </div>

              {filtered ? (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                  <X />
                  Clear filters
                </Button>
              ) : null}

              {!activeSegment ? (
                <SegmentSaveActions filters={filters} active={null} dirty={false} onCreated={onSegmentCreated} onUpdated={onSegmentUpdated} onReset={resetToSegment} />
              ) : null}

              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {loading ? <Spinner size="sm" /> : null}
                <span className="tabular-nums">
                  {items.length}
                  {nextCursor ? "+" : ""} shown
                </span>
              </span>
            </div>

            {/* Bulk bar */}
            {selected.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-primary px-3 py-2 text-primary-foreground shadow-card">
                <span className="text-[13px] font-medium tabular-nums">
                  {selected.size} selected
                </span>
                <span className="mx-1 h-4 w-px bg-primary-foreground/25" aria-hidden />
                <Button size="sm" variant="secondary" className="h-7 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20" onClick={() => setBulkDialog("add")}>
                  <Tag />
                  Add tag
                </Button>
                <Button size="sm" variant="secondary" className="h-7 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20" onClick={() => setBulkDialog("remove")}>
                  <TagIcon />
                  Remove tag
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="secondary" className="h-7 bg-primary-foreground/10 text-primary-foreground hover:bg-destructive hover:text-destructive-foreground">
                      <Trash2 />
                      Delete
                    </Button>
                  }
                  title={`Delete ${selected.size} contact${selected.size === 1 ? "" : "s"}?`}
                  description="Their conversations, messages and flow progress are deleted too. Delivery logs are kept for reporting. If they interact again, a fresh contact is created."
                  confirmLabel="Delete contacts"
                  destructive
                  onConfirm={deleteSelected}
                />
                <Button size="sm" variant="ghost" className="ml-auto h-7 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </div>
            ) : null}

            {/* Table */}
            {items.length === 0 && !loading ? (
              <EmptyState
                icon={Search}
                title={activeSegment ? "No contacts in this segment yet" : "No contacts match"}
                description={
                  activeSegment
                    ? "Contacts join automatically as soon as they match the segment's filters."
                    : "Try a different search, pick another channel, or loosen the tag filter."
                }
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    {activeSegment ? "Show all contacts" : "Clear filters"}
                  </Button>
                }
              />
            ) : (
              <div className={cn("rounded-lg border bg-card shadow-card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={(v) => toggleAll(v === true)}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="text-center">Follower</TableHead>
                      <TableHead>Last interaction</TableHead>
                      <TableHead className="text-right">DMs received</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const isSelected = selected.has(item.id);
                      const profileUrl = contactProfileUrl(item);
                      return (
                        <TableRow key={item.id} data-state={isSelected ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox checked={isSelected} onCheckedChange={(v) => toggleOne(item.id, v === true)} aria-label={`Select ${contactDisplayName(item)}`} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <ContactAvatar name={item.name} username={item.username} avatarUrl={item.avatarUrl} platform={item.platform} size="sm" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <Link href={`/contacts/${item.id}`} className="truncate font-medium hover:underline">
                                    {contactDisplayName(item)}
                                  </Link>
                                  {item.optedOut ? (
                                    <Badge variant="warning" className="h-4 px-1.5">
                                      Opted out
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="truncate text-[12px] text-muted-foreground">
                                  {item.username && item.name ? `@${item.username.replace(/^@/, "")} · ` : ""}
                                  {channelLabel(item.channel)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <TagChips tags={item.tags} />
                          </TableCell>
                          <TableCell className="text-center">
                            {item.isFollower ? (
                              <Check className="mx-auto h-4 w-4 text-success" aria-label="Follower" />
                            ) : (
                              <span className="text-muted-foreground" title={item.isFollower === null ? "Unknown — learned during a follow gate" : "Not following"}>
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {item.lastInteractionAt ? (
                              <time dateTime={item.lastInteractionAt} title={formatAbsolute(item.lastInteractionAt, timezone)} suppressHydrationWarning>
                                {formatRelative(item.lastInteractionAt)}
                              </time>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(item.dmsReceived)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Contact actions">
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem asChild>
                                  <Link href={`/contacts/${item.id}`}>
                                    <UserRound />
                                    View profile
                                  </Link>
                                </DropdownMenuItem>
                                {item.conversationId ? (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/inbox?c=${encodeURIComponent(item.conversationId)}`}>
                                      <Inbox />
                                      Open in Inbox
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}
                                {profileUrl ? (
                                  <DropdownMenuItem asChild>
                                    <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink />
                                      Open on {platformLabel(item.platform)}
                                    </a>
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem destructive onSelect={() => setDeleteTarget(item)}>
                                  <Trash2 />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {nextCursor ? (
                  <div className="flex items-center justify-center border-t p-3">
                    <Button variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                      Load more
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      <BulkTagDialog
        open={bulkDialog !== null}
        onOpenChange={(open) => !open && setBulkDialog(null)}
        mode={bulkDialog ?? "add"}
        ids={selectedIds}
        suggestions={bulkDialog === "remove" ? selectedTagUnion : tagOptions.map((t) => t.tag)}
        onApplied={onBulkTagsApplied}
      />

      <ConfirmDialog
        trigger={null}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${contactDisplayName(deleteTarget)}?` : "Delete contact?"}
        description="Their conversation, messages and flow progress are deleted too. Delivery logs are kept for reporting."
        confirmLabel="Delete contact"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await deleteOne(deleteTarget);
        }}
      />

      <SegmentFormDialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        mode="rename"
        initialName={renameTarget?.name ?? ""}
        initialDescription={renameTarget?.description ?? null}
        onSubmit={renameSegment}
      />

      <ConfirmDialog
        trigger={null}
        open={deleteSegmentTarget !== null}
        onOpenChange={(open) => !open && setDeleteSegmentTarget(null)}
        title={deleteSegmentTarget ? `Delete “${deleteSegmentTarget.name}”?` : "Delete segment?"}
        description="Only the saved filters are removed — no contacts are affected. Broadcasts that used this segment keep their own copy of the filters."
        confirmLabel="Delete segment"
        destructive
        onConfirm={deleteSegment}
      />
    </>
  );
}

export { ContactsView };
