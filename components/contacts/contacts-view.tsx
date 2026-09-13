"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Columns3,
  Download,
  ExternalLink,
  Inbox,
  Layers,
  List,
  MoreHorizontal,
  Plug,
  Plus,
  Search,
  Settings2,
  SquareKanban,
  Tags,
  Trash2,
  Upload,
  UserRound,
  Workflow,
  X,
} from "lucide-react";

import { StageDot } from "@/components/pipelines/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContactChannelSummary, ContactListItem, ContactListResult, ContactStats, ContactTagCount } from "@/lib/services/contacts";
import type { ContactPipelineRef, PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import type { SegmentSummary } from "@/lib/services/segments";
import { cn } from "@/lib/utils";

import { AddContactDialog } from "./add-contact-dialog";
import { contactsApi, errorMessage, pipelinesApi, segmentsApi } from "./api";
import { BulkTagDialog } from "./bulk-tag-dialog";
import { ContactAvatar } from "./contact-avatar";
import { OwnerAvatar, type OwnerOption, ownerLabel } from "./contact-details-card";
import { ContactsBoard } from "./contacts-board";
import {
  type ContactFilterState,
  DEFAULT_PAGE_SIZE,
  describeSegmentFilters,
  EMPTY_FILTERS,
  filtersEqual,
  filtersToSearchParams,
  hasActiveFilters,
  hasRefiningFilters,
  PAGE_SIZES,
  segmentFiltersToState,
} from "./filters";
import { contactDisplayName, contactProfileUrl, formatAbsolute, formatRelative, platformLabel } from "./format";
import { ImportContactsDialog } from "./import-contacts-dialog";
import { ManageTagsDialog } from "./manage-tags-dialog";
import { MoreFiltersPopover } from "./more-filters-popover";
import { PipelineStageMenuItems, PipelineSwitcher, PipelinesCell, StageSelectCell, StageStrip } from "./pipeline-controls";
import { SegmentFormDialog } from "./segments-dialog";
import { SegmentsRail, SegmentsSelect } from "./segments-rail";
import { SegmentSaveActions } from "./segments-save";
import { TagChips } from "./tag-chips";
import { TagFilterPopover } from "./tag-filter-popover";

export type ContactsViewMode = "list" | "board";

export interface ContactsViewProps {
  /** The first page, rendered on the server; null when the page opened on the board. */
  initialResult: ContactListResult | null;
  initialPage: number;
  initialPageSize: number;
  initialFilters: ContactFilterState;
  initialView: ContactsViewMode;
  /** Saved segments with live counts (name order). */
  segments: SegmentSummary[];
  /** Segment the page was opened on (`?segment=`), if it exists. */
  activeSegmentId: string | null;
  channels: ContactChannelSummary[];
  tags: ContactTagCount[];
  stats: ContactStats;
  pipelines: PipelineSummary[];
  owners: OwnerOption[];
  viewerId: string;
  canManagePipelines: boolean;
  timezone: string;
}

const ALL = "all";
const UNASSIGNED = "unassigned";

function uniq(tags: string[]): string[] {
  return Array.from(new Set(tags));
}

function byName(a: SegmentSummary, b: SegmentSummary): number {
  return a.name.localeCompare(b.name);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Identifies one loaded page: the same filters, page and size never refetch. */
function queryKey(filters: ContactFilterState, page: number, pageSize: number): string {
  return `${filtersToSearchParams(filters).toString()}|${page}|${pageSize}`;
}

/** The contact's pipeline places after putting them at `stage` in `pipeline`. */
function withStage(entries: ContactPipelineRef[], pipeline: PipelineSummary, stage: PipelineStageSummary): ContactPipelineRef[] {
  const next: ContactPipelineRef = {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    stageId: stage.id,
    stageName: stage.name,
    stageColor: stage.color,
    stagePosition: stage.position,
    updatedAt: new Date().toISOString(),
  };
  const found = entries.some((e) => e.pipelineId === pipeline.id);
  return found ? entries.map((e) => (e.pipelineId === pipeline.id ? next : e)) : [...entries, next];
}

/** Compact in-row owner picker. */
function OwnerCell({ item, owners, onChange }: { item: ContactListItem; owners: OwnerOption[]; onChange: (ownerId: string | null) => void }) {
  const owner = owners.find((o) => o.id === item.ownerId) ?? item.owner;
  return (
    <Select value={item.ownerId ?? UNASSIGNED} onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}>
      <SelectTrigger
        className="h-7 w-auto max-w-[11rem] gap-1.5 border-transparent bg-transparent px-1.5 text-[13px] shadow-none hover:border-input [&>svg]:h-3 [&>svg]:w-3"
        aria-label={`Owner for ${contactDisplayName(item)}`}
      >
        {/* A div, not a span: the trigger line-clamps direct span children, which would stack the avatar over the name. */}
        {owner ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <OwnerAvatar owner={owner} />
            <div className="truncate">{ownerLabel(owner)}</div>
          </div>
        ) : (
          <div className="text-muted-foreground">Unassigned</div>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>
          <span className="text-muted-foreground">Unassigned</span>
        </SelectItem>
        {owners.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="flex items-center gap-2">
              <OwnerAvatar owner={o} />
              {ownerLabel(o)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The contacts CRM. The server renders the first page; every filter or page
 * change refetches through /api/contacts and mirrors itself into the URL so
 * the view is shareable and the export link carries the same filters.
 *
 * The pipeline switcher narrows everything to one pipeline (its stages become
 * tabs and board columns); "All contacts" shows everyone, in a pipeline or not.
 * A selected segment is `?segment=<id>`; once its filters are edited the
 * explicit params are written too, and the toolbar offers to save them back.
 */
function ContactsView({
  initialResult,
  initialPage,
  initialPageSize,
  initialFilters,
  initialView,
  segments: initialSegments,
  activeSegmentId,
  channels,
  tags,
  stats,
  pipelines: initialPipelines,
  owners,
  viewerId,
  canManagePipelines,
  timezone,
}: ContactsViewProps) {
  const router = useRouter();
  const [view, setView] = React.useState<ContactsViewMode>(initialView);
  const [filters, setFilters] = React.useState<ContactFilterState>(initialFilters);
  const [segments, setSegments] = React.useState<SegmentSummary[]>(initialSegments);
  const [activeId, setActiveId] = React.useState<string | null>(activeSegmentId);
  const [pipelines, setPipelines] = React.useState<PipelineSummary[]>(initialPipelines);
  const [items, setItems] = React.useState<ContactListItem[]>(initialResult?.items ?? []);
  const [page, setPage] = React.useState(initialResult?.page ?? initialPage);
  const [pageSize, setPageSize] = React.useState(initialResult?.pageSize ?? initialPageSize);
  const [total, setTotal] = React.useState(initialResult?.total ?? 0);
  const [pageCount, setPageCount] = React.useState(initialResult?.pageCount ?? 1);
  const [loadedKey, setLoadedKey] = React.useState<string | null>(() =>
    initialResult ? queryKey(initialFilters, initialResult.page, initialResult.pageSize) : null,
  );
  const [stageCounts, setStageCounts] = React.useState<Record<string, number> | null>(null);
  const [countsVersion, setCountsVersion] = React.useState(0);
  const [boardVersion, setBoardVersion] = React.useState(0);
  const [tagOptions, setTagOptions] = React.useState<ContactTagCount[]>(tags);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkDialog, setBulkDialog] = React.useState<"add" | "remove" | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ContactListItem | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<SegmentSummary | null>(null);
  const [deleteSegmentTarget, setDeleteSegmentTarget] = React.useState<SegmentSummary | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const tableTopRef = React.useRef<HTMLDivElement>(null);

  // Server-rendered lists win after every router.refresh().
  const [tagsSource, setTagsSource] = React.useState(tags);
  if (tagsSource !== tags) {
    setTagsSource(tags);
    setTagOptions(tags);
  }
  const [segmentsSource, setSegmentsSource] = React.useState(initialSegments);
  if (segmentsSource !== initialSegments) {
    setSegmentsSource(initialSegments);
    setSegments(initialSegments);
  }
  const [pipelinesSource, setPipelinesSource] = React.useState(initialPipelines);
  if (pipelinesSource !== initialPipelines) {
    setPipelinesSource(initialPipelines);
    setPipelines(initialPipelines);
  }

  const activeSegment = React.useMemo(() => segments.find((s) => s.id === activeId) ?? null, [segments, activeId]);
  const dirty = activeSegment ? !filtersEqual(filters, segmentFiltersToState(activeSegment.filters)) : false;
  const pipeline = React.useMemo(() => pipelines.find((p) => p.id === filters.pipelineId) ?? null, [pipelines, filters.pipelineId]);

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

  /** Pipeline totals (switcher) and filtered stage counts (tabs) after contacts move. */
  const refreshPipelineCounts = React.useCallback(async () => {
    setCountsVersion((v) => v + 1);
    try {
      setPipelines(await pipelinesApi.list());
    } catch {
      // Non-critical: the numbers catch up on the next load.
    }
  }, []);

  const runQuery = React.useCallback(async (f: ContactFilterState, p: number, size: number, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await contactsApi.list(f, { page: p, pageSize: size, signal });
      setItems(res.items);
      setTotal(res.total);
      setPageCount(res.pageCount);
      setSelected(new Set());
      // A page past the end comes back clamped to the last page.
      if (res.page !== p) setPage(res.page);
      setLoadedKey(queryKey(f, res.page, res.pageSize));
    } catch (err) {
      if (signal?.aborted) return;
      toast.error(errorMessage(err, "Couldn't load contacts"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const reload = React.useCallback(() => {
    if (view === "list") void runQuery(filters, page, pageSize);
    else setBoardVersion((v) => v + 1);
  }, [view, runQuery, filters, page, pageSize]);

  // URL sync: a clean segment is just `?segment=`; edited filters are spelled out so a reload keeps them.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (view === "board") params.set("view", "board");
    if (activeId) params.set("segment", activeId);
    if (!activeId || dirty) {
      for (const [k, v] of filtersToSearchParams(filters)) params.set(k, v);
    }
    if (view === "list" && page > 1) params.set("page", String(page));
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filters, activeId, dirty, view, page, pageSize]);

  // Fetch whenever the wanted page differs from the one on screen. Typing is
  // debounced; the server already rendered the first page.
  const wantedKey = queryKey(filters, page, pageSize);
  React.useEffect(() => {
    if (view !== "list" || wantedKey === loadedKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runQuery(filters, page, pageSize, controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [wantedKey, loadedKey, view, runQuery, filters, page, pageSize]);

  // Stage tab numbers follow every filter except the stage itself.
  const pipelineId = pipeline?.id ?? null;
  const countsQuery = filtersToSearchParams({ ...filters, pipelineId: "", stageId: "" }).toString();
  const filtersRef = React.useRef(filters);
  React.useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  React.useEffect(() => {
    if (!pipelineId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const counts = await pipelinesApi.counts(pipelineId, filtersRef.current, controller.signal);
        if (!controller.signal.aborted) setStageCounts(counts);
      } catch {
        // The tabs keep showing the pipeline's own totals.
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pipelineId, countsQuery, countsVersion]);

  /** Every filter change starts again from the first page. */
  function applyFilters(next: ContactFilterState | ((prev: ContactFilterState) => ContactFilterState)) {
    setFilters(next);
    setPage(1);
  }

  function patch(next: Partial<ContactFilterState>) {
    applyFilters((prev) => ({ ...prev, ...next }));
  }

  /** Clears the toolbar but keeps the pipeline being viewed; without one it also leaves the segment. */
  function clearFilters() {
    if (!filters.pipelineId) setActiveId(null);
    applyFilters({ ...EMPTY_FILTERS, pipelineId: filters.pipelineId });
    searchRef.current?.focus();
  }

  function selectPipeline(id: string) {
    if (id === filters.pipelineId) return;
    setStageCounts(null);
    patch({ pipelineId: id, stageId: "" });
    if (!id && view === "board") setView("list");
  }

  function switchView(next: ContactsViewMode) {
    if (next === view) return;
    setSelected(new Set());
    if (next === "board" && !filters.pipelineId) {
      const first = pipelines[0];
      if (!first) return;
      patch({ pipelineId: first.id, stageId: "" });
    }
    setView(next);
    // Moves on the board may have changed the list.
    if (next === "list") setLoadedKey(null);
  }

  function changePage(next: number) {
    setPage(next);
    tableTopRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ── Segments ──
  function selectSegment(id: string | null) {
    const segment = id ? segments.find((s) => s.id === id) : null;
    setActiveId(segment ? segment.id : null);
    applyFilters(segment ? segmentFiltersToState(segment.filters) : EMPTY_FILTERS);
  }

  function resetToSegment() {
    if (activeSegment) applyFilters(segmentFiltersToState(activeSegment.filters));
  }

  function onSegmentCreated(segment: SegmentSummary) {
    setSegments((prev) => [...prev.filter((s) => s.id !== segment.id), segment].sort(byName));
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
        applyFilters(EMPTY_FILTERS);
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

  // ── Row edits ──
  async function setStage(item: ContactListItem, target: PipelineSummary, stage: PipelineStageSummary) {
    const current = item.pipelines.find((e) => e.pipelineId === target.id);
    if (current?.stageId === stage.id) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pipelines: withStage(i.pipelines, target, stage) } : i)));
    try {
      const entries = await contactsApi.setStage(item.id, target.id, stage.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pipelines: entries } : i)));
      toast.success(current ? `${contactDisplayName(item)} moved to ${stage.name}` : `${contactDisplayName(item)} added to ${target.name}`);
      void refreshPipelineCounts();
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pipelines: item.pipelines } : i)));
      toast.error(errorMessage(err, "Couldn't change the stage"));
    }
  }

  async function removeFromPipeline(item: ContactListItem, target: PipelineSummary) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pipelines: i.pipelines.filter((e) => e.pipelineId !== target.id) } : i)));
    try {
      await contactsApi.removeFromPipeline(item.id, target.id);
      toast.success(`${contactDisplayName(item)} removed from ${target.name}`);
      void refreshPipelineCounts();
      // In that pipeline's view the row no longer belongs on the page.
      if (filters.pipelineId === target.id) reload();
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pipelines: item.pipelines } : i)));
      toast.error(errorMessage(err, "Couldn't remove the contact from the pipeline"));
    }
  }

  async function changeOwner(item: ContactListItem, ownerId: string | null) {
    if (ownerId === item.ownerId) return;
    const owner = owners.find((o) => o.id === ownerId) ?? null;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ownerId, owner } : i)));
    try {
      await contactsApi.update(item.id, { ownerId });
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ownerId: item.ownerId, owner: item.owner } : i)));
      toast.error(errorMessage(err, "Couldn't change the owner"));
    }
  }

  // ── Bulk ──
  async function bulkStage(target: PipelineSummary, stage: PipelineStageSummary) {
    try {
      const res = await contactsApi.bulkUpdate({ ids: selectedIds, pipelineId: target.id, stageId: stage.id });
      toast.success(res.stage > 0 ? `Moved ${plural(res.stage, "contact")} to ${stage.name} in ${target.name}` : `Everyone selected is already at ${stage.name}`);
      reload();
      void refreshPipelineCounts();
      void refreshSegments();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't change the stage"));
    }
  }

  async function bulkRemoveFromPipeline(target: PipelineSummary) {
    try {
      const res = await contactsApi.bulkUpdate({ ids: selectedIds, removeFromPipelineId: target.id });
      toast.success(res.removedFromPipeline > 0 ? `Removed ${plural(res.removedFromPipeline, "contact")} from ${target.name}` : `No one selected is in ${target.name}`);
      reload();
      void refreshPipelineCounts();
      void refreshSegments();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove contacts from the pipeline"));
    }
  }

  async function bulkOwner(ownerId: string | null) {
    const owner = owners.find((o) => o.id === ownerId) ?? null;
    try {
      const res = await contactsApi.bulkUpdate({ ids: selectedIds, ownerId });
      setItems((prev) => prev.map((i) => (selected.has(i.id) ? { ...i, ownerId, owner } : i)));
      toast.success(owner ? `Assigned ${plural(res.owner, "contact")} to ${ownerLabel(owner)}` : `Unassigned ${plural(res.owner, "contact")}`);
      void refreshSegments();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't change the owner"));
    }
  }

  function onBulkTagsApplied({ mode, tags: changed }: { mode: "add" | "remove"; tags: string[] }) {
    setItems((prev) =>
      prev.map((item) =>
        selected.has(item.id) ? { ...item, tags: mode === "add" ? uniq([...item.tags, ...changed]) : item.tags.filter((t) => !changed.includes(t)) } : item,
      ),
    );
    void refreshTags();
    void refreshSegments();
  }

  async function deleteSelected() {
    try {
      const { deleted } = await contactsApi.removeMany(selectedIds);
      toast.success(`Deleted ${plural(deleted, "contact")}`);
      reload();
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
      toast.success(`Deleted ${contactDisplayName(item)}`);
      reload();
      router.refresh();
      void refreshTags();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete this contact"));
      throw err;
    }
  }

  function onTagsManaged() {
    reload();
    void refreshTags();
    void refreshSegments();
    router.refresh();
  }

  const refining = hasRefiningFilters(filters);
  const filtered = hasActiveFilters(filters);
  const workspaceEmpty = stats.total === 0 && !filtered && segments.length === 0;
  const allTags = React.useMemo(() => tagOptions.map((t) => t.tag), [tagOptions]);
  const ownerFilterOptions = React.useMemo(() => {
    const me = owners.find((o) => o.id === viewerId);
    return me ? [me, ...owners.filter((o) => o.id !== viewerId)] : owners;
  }, [owners, viewerId]);
  const bulkButton = "h-7 bg-background/10 text-background hover:bg-background/20";

  const headerActions = (
    <>
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={channels.length === 0}>
        <Upload />
        Import
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="More contact actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild disabled={workspaceEmpty}>
            <a href={contactsApi.exportUrl(filters)} download>
              <Download />
              {filtered ? "Export these contacts" : "Export all contacts"}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTagsOpen(true)}>
            <Tags />
            Manage tags
          </DropdownMenuItem>
          {canManagePipelines ? (
            <DropdownMenuItem asChild>
              <Link href="/contacts/pipelines">
                <Settings2 />
                Manage pipelines
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={() => setAddOpen(true)} disabled={channels.length === 0}>
        <Plus />
        Add contact
      </Button>
    </>
  );

  const stageOnly = pipeline && filters.stageId ? pipeline.stages.find((s) => s.id === filters.stageId) : undefined;
  const emptyList = stageOnly && !hasRefiningFilters({ ...filters, stageId: "" }) ? (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="text-sm font-medium">No one is at {stageOnly.name} yet</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Move contacts here from another stage, the board or a contact&apos;s page.</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => patch({ stageId: "" })}>
        Show every stage
      </Button>
    </div>
  ) : pipeline && !refining ? (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <SquareKanban className="mx-auto h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <p className="mt-3 text-sm font-medium">No one is in {pipeline.name} yet</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
        Add contacts from the list, a contact&apos;s page or an import. Automations can add people with the Add to pipeline step.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => selectPipeline("")}>
        Show all contacts
      </Button>
    </div>
  ) : (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="text-sm font-medium">{activeSegment && !dirty ? "No one is in this segment yet" : "No contacts match"}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {activeSegment && !dirty ? "People join as soon as they match its filters." : "Try another search or remove a filter."}
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
        {activeSegment && !dirty ? "Show all contacts" : "Clear filters"}
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Contacts" description="Everyone who commented, messaged or replied to a story, and anyone you add yourself." actions={headerActions} />

      {workspaceEmpty ? (
        <EmptyState
          icon={UserRound}
          title="No contacts yet"
          description={
            channels.length === 0
              ? "Connect an Instagram or Facebook account. People who comment or message it show up here."
              : "People appear here the first time they comment on, message or reply to a story on your account. You can also add or import them."
          }
          action={
            channels.length === 0 ? (
              <Button asChild>
                <Link href="/channels">
                  <Plug />
                  Connect an account
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/automations/templates">
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
            className={cn("sticky top-6 hidden", view === "list" && "2xl:block")}
            segments={segments}
            activeId={activeId}
            totalCount={stats.total}
            onSelect={selectSegment}
            onRename={setRenameTarget}
            onDelete={setDeleteSegmentTarget}
            pipelines={pipelines}
          />

          <div className="min-w-0 flex-1 space-y-3">
            {activeSegment ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2 shadow-card">
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{activeSegment.name}</span>
                    {dirty ? <Badge variant="outline">Edited</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground" title={describeSegmentFilters(activeSegment.filters, pipelines)}>
                    {activeSegment.description || describeSegmentFilters(activeSegment.filters, pipelines)}
                  </p>
                </div>
                <SegmentSaveActions
                  filters={filters}
                  active={activeSegment}
                  dirty={dirty}
                  onCreated={onSegmentCreated}
                  onUpdated={onSegmentUpdated}
                  onReset={resetToSegment}
                  pipelines={pipelines}
                />
              </div>
            ) : null}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <PipelineSwitcher pipelines={pipelines} value={filters.pipelineId} totalCount={stats.total} canManage={canManagePipelines} onChange={selectPipeline} />
              <SegmentsSelect
                className={cn(view === "list" && "2xl:hidden")}
                segments={segments}
                activeId={activeId}
                totalCount={stats.total}
                onSelect={selectSegment}
                onRename={setRenameTarget}
                onDelete={setDeleteSegmentTarget}
              />

              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  ref={searchRef}
                  value={filters.q}
                  onChange={(e) => patch({ q: e.target.value })}
                  placeholder="Search contacts"
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

              <Select value={filters.ownerId || ALL} onValueChange={(v) => patch({ ownerId: v === ALL ? "" : v })}>
                <SelectTrigger className={cn("h-8 w-auto min-w-[8.5rem] text-[13px]", filters.ownerId && "border-foreground")} aria-label="Owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any owner</SelectItem>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {ownerFilterOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.id === viewerId ? "Assigned to me" : ownerLabel(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <TagFilterPopover options={tagOptions} selected={filters.tags} mode={filters.tagMode} onChange={({ tags: t, mode }) => patch({ tags: t, tagMode: mode })} />
              <MoreFiltersPopover filters={filters} onChange={patch} channels={channels} tags={tagOptions} />

              {refining ? (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                  <X />
                  Clear
                </Button>
              ) : null}

              {/* A pipeline on its own is one click away in the switcher, so only offer to save once something narrows it. */}
              {!activeSegment && refining ? (
                <SegmentSaveActions
                  filters={filters}
                  active={null}
                  dirty={false}
                  onCreated={onSegmentCreated}
                  onUpdated={onSegmentUpdated}
                  onReset={resetToSegment}
                  pipelines={pipelines}
                />
              ) : null}

              <div className="ml-auto flex items-center gap-3">
                {view === "list" && loading ? <Spinner size="sm" /> : null}
                {pipelines.length > 0 ? (
                  <div role="radiogroup" aria-label="View" className="inline-flex h-8 items-center rounded-md bg-muted p-0.5">
                    {(
                      [
                        { value: "list", label: "List", icon: List },
                        { value: "board", label: "Board", icon: Columns3 },
                      ] as const
                    ).map((option) => {
                      const Icon = option.icon;
                      const checked = view === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          onClick={() => switchView(option.value)}
                          title={option.value === "board" && !pipeline ? "Opens the board for your first pipeline" : undefined}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                            checked ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {pipeline && view === "list" ? (
              <StageStrip pipeline={pipeline} counts={stageCounts} value={filters.stageId} onChange={(stageId) => patch({ stageId })} />
            ) : null}

            {view === "board" && pipeline ? (
              <ContactsBoard key={pipeline.id} filters={filters} pipeline={pipeline} version={boardVersion} onMoved={() => void refreshPipelineCounts()} />
            ) : view === "board" ? (
              <div className="rounded-lg border border-dashed px-6 py-12 text-center">
                <p className="text-sm font-medium">That pipeline no longer exists</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => selectPipeline(pipelines[0]?.id ?? "")}>
                  {pipelines[0] ? `Open ${pipelines[0].name}` : "Show all contacts"}
                </Button>
              </div>
            ) : (
              <>
                <div ref={tableTopRef} className="scroll-mt-4" />
                {selected.size > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-foreground px-3 py-2 text-background shadow-card">
                    <span className="text-[13px] font-medium tabular-nums">{selected.size} selected</span>
                    <span className="mx-1 h-4 w-px bg-background/25" aria-hidden />
                    {pipelines.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="secondary" className={bulkButton}>
                            {pipeline ? "Move to stage" : "Add to pipeline"}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          {pipeline ? (
                            <>
                              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{pipeline.name}</DropdownMenuLabel>
                              {pipeline.stages.map((s) => (
                                <DropdownMenuItem key={s.id} onSelect={() => void bulkStage(pipeline, s)}>
                                  <StageDot color={s.color} />
                                  {s.name}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => void bulkRemoveFromPipeline(pipeline)}>
                                <X />
                                Remove from {pipeline.name}
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <PipelineStageMenuItems
                              pipelines={pipelines}
                              onSetStage={(p, s) => void bulkStage(p, s)}
                              onRemove={(p) => void bulkRemoveFromPipeline(p)}
                              alwaysShowRemove
                            />
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="secondary" className={bulkButton}>
                          Assign
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Owner</DropdownMenuLabel>
                        {owners.map((o) => (
                          <DropdownMenuItem key={o.id} onSelect={() => void bulkOwner(o.id)}>
                            <OwnerAvatar owner={o} />
                            {ownerLabel(o)}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void bulkOwner(null)}>Remove owner</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="sm" variant="secondary" className={bulkButton} onClick={() => setBulkDialog("add")}>
                      Add tags
                    </Button>
                    <Button size="sm" variant="secondary" className={bulkButton} onClick={() => setBulkDialog("remove")}>
                      Remove tags
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="secondary" className="h-7 bg-background/10 text-background hover:bg-destructive hover:text-destructive-foreground">
                          <Trash2 />
                          Delete
                        </Button>
                      }
                      title={`Delete ${plural(selected.size, "contact")}?`}
                      description="Their conversations, notes and automation progress are removed too. If they message you again, they come back as new contacts."
                      confirmLabel="Delete contacts"
                      destructive
                      onConfirm={deleteSelected}
                    />
                    <Button size="sm" variant="ghost" className="ml-auto h-7 text-background/80 hover:bg-background/10 hover:text-background" onClick={() => setSelected(new Set())}>
                      Clear selection
                    </Button>
                  </div>
                ) : null}

                {items.length === 0 && !loading && loadedKey !== null ? (
                  emptyList
                ) : (
                  <div className={cn("overflow-hidden rounded-lg border bg-card shadow-card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-10 pl-4">
                              <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Select all on this page" />
                            </TableHead>
                            <TableHead className="min-w-[220px]">Contact</TableHead>
                            <TableHead className="w-[190px]">{pipeline ? "Stage" : "Pipeline"}</TableHead>
                            <TableHead className="w-[170px]">Owner</TableHead>
                            <TableHead className="w-[170px]">Tags</TableHead>
                            <TableHead className="w-[120px]">Last activity</TableHead>
                            <TableHead className="w-10">
                              <span className="sr-only">Actions</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => {
                            const isSelected = selected.has(item.id);
                            const name = contactDisplayName(item);
                            const profileUrl = contactProfileUrl(item);
                            const secondary = [item.username && item.name ? `@${item.username.replace(/^@/, "")}` : null, item.email].filter(Boolean).join(" · ");
                            return (
                              <TableRow key={item.id} data-state={isSelected ? "selected" : undefined}>
                                <TableCell className="pl-4">
                                  <Checkbox checked={isSelected} onCheckedChange={(v) => toggleOne(item.id, v === true)} aria-label={`Select ${name}`} />
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <ContactAvatar name={item.name} username={item.username} avatarUrl={item.avatarUrl} platform={item.platform} size="sm" />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <Link href={`/contacts/${item.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                                          {name}
                                        </Link>
                                        {item.optedOut ? <Badge variant="warning">Stopped</Badge> : null}
                                      </div>
                                      {secondary ? <div className="truncate text-xs text-muted-foreground">{secondary}</div> : null}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {pipeline ? (
                                    <StageSelectCell
                                      pipeline={pipeline}
                                      entry={item.pipelines.find((e) => e.pipelineId === pipeline.id)}
                                      contactName={name}
                                      onChange={(stageId) => {
                                        const stage = pipeline.stages.find((s) => s.id === stageId);
                                        if (stage) void setStage(item, pipeline, stage);
                                      }}
                                    />
                                  ) : (
                                    <PipelinesCell
                                      pipelines={pipelines}
                                      entries={item.pipelines}
                                      contactName={name}
                                      onSetStage={(p, s) => void setStage(item, p, s)}
                                      onRemove={(p) => void removeFromPipeline(item, p)}
                                    />
                                  )}
                                </TableCell>
                                <TableCell>
                                  <OwnerCell item={item} owners={owners} onChange={(ownerId) => void changeOwner(item, ownerId)} />
                                </TableCell>
                                <TableCell>
                                  <TagChips tags={item.tags} max={1} className="flex-nowrap" />
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
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label={`Actions for ${name}`}>
                                        <MoreHorizontal />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-52">
                                      <DropdownMenuItem asChild>
                                        <Link href={`/contacts/${item.id}`}>
                                          <UserRound />
                                          Open contact
                                        </Link>
                                      </DropdownMenuItem>
                                      {item.conversationId ? (
                                        <DropdownMenuItem asChild>
                                          <Link href={`/inbox?c=${encodeURIComponent(item.conversationId)}`}>
                                            <Inbox />
                                            Open conversation
                                          </Link>
                                        </DropdownMenuItem>
                                      ) : null}
                                      {profileUrl ? (
                                        <DropdownMenuItem asChild>
                                          <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink />
                                            View on {platformLabel(item.platform)}
                                          </a>
                                        </DropdownMenuItem>
                                      ) : null}
                                      {pipeline && item.pipelines.some((e) => e.pipelineId === pipeline.id) ? (
                                        <DropdownMenuItem onSelect={() => void removeFromPipeline(item, pipeline)}>
                                          <X />
                                          Remove from {pipeline.name}
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
                          {items.length === 0 ? (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={7} className="py-10 text-center">
                                <Spinner size="sm" />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>

                    {total > 0 ? (
                      <div className="border-t px-4 py-2.5">
                        <Pagination
                          page={page}
                          pageCount={pageCount}
                          pageSize={pageSize}
                          total={total}
                          pageSizes={PAGE_SIZES}
                          onPageChange={changePage}
                          onPageSizeChange={(size) => {
                            setPageSize(size);
                            setPage(1);
                          }}
                          noun={total === 1 ? "contact" : "contacts"}
                          disabled={loading}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <AddContactDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        channels={channels}
        pipelines={pipelines}
        defaultPipelineId={pipeline?.id ?? null}
        defaultStageId={filters.stageId || null}
        allTags={allTags}
      />
      <ImportContactsDialog open={importOpen} onOpenChange={setImportOpen} channels={channels} pipelines={pipelines} defaultPipelineId={pipeline?.id ?? null} allTags={allTags} />
      <ManageTagsDialog tags={tagOptions} onChanged={onTagsManaged} open={tagsOpen} onOpenChange={setTagsOpen} />

      <BulkTagDialog
        open={bulkDialog !== null}
        onOpenChange={(open) => !open && setBulkDialog(null)}
        mode={bulkDialog ?? "add"}
        ids={selectedIds}
        suggestions={bulkDialog === "remove" ? selectedTagUnion : allTags}
        onApplied={onBulkTagsApplied}
      />

      <ConfirmDialog
        trigger={null}
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${contactDisplayName(deleteTarget)}?` : "Delete contact?"}
        description="Their conversation, notes and automation progress are removed. If they message you again, they come back as a new contact."
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
        description="Only the saved filters are removed. The contacts in it stay as they are."
        confirmLabel="Delete segment"
        destructive
        onConfirm={deleteSegment}
      />
    </>
  );
}

export { ContactsView };
