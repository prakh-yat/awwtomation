"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Columns3, Download, List, MoreHorizontal, Plus, Settings2, Tags, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import type { ContactChannelSummary, ContactListItem, ContactListResult, ContactStats, ContactTagCount } from "@/lib/services/contacts";
import type { ContactPipelineRef, PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import type { SegmentSummary } from "@/lib/services/segments";

import { AddContactDialog } from "./add-contact-dialog";
import { contactsApi, errorMessage, pipelinesApi, segmentsApi } from "./api";
import { BulkBar } from "./bulk-bar";
import { BulkTagDialog } from "./bulk-tag-dialog";
import { type OwnerOption, ownerLabel } from "./contact-details-card";
import { ContactsBoard } from "./contacts-board";
import { BoardMissing, ContactsListEmpty, ContactsWorkspaceEmpty } from "./contacts-empty";
import { ContactsTable } from "./contacts-table";
import { OwnerFilter, SearchField } from "./contacts-toolbar";
import {
  type ContactFilterState,
  DEFAULT_PAGE_SIZE,
  EMPTY_FILTERS,
  filtersEqual,
  filtersToSearchParams,
  hasActiveFilters,
  hasRefiningFilters,
  PAGE_SIZES,
  segmentFiltersToState,
} from "./filters";
import { contactDisplayName } from "./format";
import { ImportContactsDialog } from "./import-contacts-dialog";
import { ManageTagsDialog } from "./manage-tags-dialog";
import { MoreFiltersPopover } from "./more-filters-popover";
import { PipelineSwitcher, StageFilter } from "./pipeline-controls";
import { SegmentsBar } from "./segments-bar";
import { SegmentFormDialog } from "./segments-dialog";
import { SegmentSaveActions } from "./segments-save";
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

const VIEW_OPTIONS: SegmentedOption<ContactsViewMode>[] = [
  { value: "list", label: "List", icon: List },
  { value: "board", label: "Board", icon: Columns3 },
];

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
      // Non-critical: counts on the segment chips go stale until the next load.
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
  const showBulkBar = !workspaceEmpty && view === "list" && selected.size > 0;

  const headerActions = (
    <>
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={channels.length === 0}>
        <Upload />
        Import
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="More contact actions">
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
  const emptyStage = stageOnly && !hasRefiningFilters({ ...filters, stageId: "" }) ? stageOnly : null;

  return (
    <>
      <PageHeader title="Contacts" actions={headerActions} />

      {workspaceEmpty ? (
        <ContactsWorkspaceEmpty connected={channels.length > 0} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField ref={searchRef} value={filters.q} onChange={(q) => patch({ q })} />
            {segments.length > 0 ? (
              <SegmentsBar
                segments={segments}
                activeId={activeId}
                edited={dirty}
                totalCount={stats.total}
                onSelect={selectSegment}
                onRename={setRenameTarget}
                onDelete={setDeleteSegmentTarget}
                pipelines={pipelines}
              />
            ) : null}
            <PipelineSwitcher pipelines={pipelines} value={filters.pipelineId} totalCount={stats.total} canManage={canManagePipelines} onChange={selectPipeline} />
            {pipeline && view === "list" ? <StageFilter pipeline={pipeline} counts={stageCounts} value={filters.stageId} onChange={(stageId) => patch({ stageId })} /> : null}
            <OwnerFilter value={filters.ownerId} owners={ownerFilterOptions} viewerId={viewerId} onChange={(ownerId) => patch({ ownerId })} />
            <TagFilterPopover options={tagOptions} selected={filters.tags} mode={filters.tagMode} onChange={({ tags: t, mode }) => patch({ tags: t, tagMode: mode })} />
            <MoreFiltersPopover filters={filters} onChange={patch} channels={channels} tags={tagOptions} />

            {refining ? (
              <Button variant="ghost" size="sm" className="px-3 text-muted-foreground hover:text-ink" onClick={clearFilters}>
                <X />
                Clear
              </Button>
            ) : null}

            {/* A loaded segment can be saved back once edited; otherwise a pipeline on its own is one click away in the switcher, so only offer to save once something narrows it. */}
            {activeSegment || refining ? (
              <SegmentSaveActions
                key={activeSegment ? "segment" : "filters"}
                filters={filters}
                active={activeSegment}
                dirty={dirty}
                onCreated={onSegmentCreated}
                onUpdated={onSegmentUpdated}
                onReset={resetToSegment}
                pipelines={pipelines}
              />
            ) : null}

            <div className="ml-auto flex items-center gap-3">
              {view === "list" && loading ? <Spinner size="sm" /> : null}
              {pipelines.length > 0 ? (
                <div className="w-44">
                  <Segmented size="sm" value={view} onChange={switchView} options={VIEW_OPTIONS} aria-label="View" />
                </div>
              ) : null}
            </div>
          </div>

          {view === "board" && pipeline ? (
            <ContactsBoard key={pipeline.id} filters={filters} pipeline={pipeline} version={boardVersion} onMoved={() => void refreshPipelineCounts()} />
          ) : view === "board" ? (
            <BoardMissing next={pipelines[0] ?? null} onOpen={() => selectPipeline(pipelines[0]?.id ?? "")} />
          ) : (
            <div>
              <div ref={tableTopRef} className="scroll-mt-4" />
              {items.length === 0 && !loading && loadedKey !== null ? (
                <ContactsListEmpty
                  stageName={emptyStage?.name ?? null}
                  pipelineName={!emptyStage && pipeline && !refining ? pipeline.name : null}
                  segment={Boolean(activeSegment && !dirty)}
                  onShowEveryStage={() => patch({ stageId: "" })}
                  onShowAll={() => selectPipeline("")}
                  onClear={clearFilters}
                />
              ) : (
                <ContactsTable
                  items={items}
                  loading={loading}
                  selected={selected}
                  onToggleAll={toggleAll}
                  onToggleOne={toggleOne}
                  pipeline={pipeline}
                  pipelines={pipelines}
                  owners={owners}
                  timezone={timezone}
                  onSetStage={(item, p, s) => void setStage(item, p, s)}
                  onRemoveFromPipeline={(item, p) => void removeFromPipeline(item, p)}
                  onChangeOwner={(item, ownerId) => void changeOwner(item, ownerId)}
                  onDelete={setDeleteTarget}
                  footer={
                    total > 0 ? (
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
                    ) : null
                  }
                />
              )}
              {/* Room under the last row so the floating selection bar never covers the pages. */}
              {showBulkBar ? <div aria-hidden className="h-20" /> : null}
            </div>
          )}
        </div>
      )}

      {showBulkBar ? (
        <BulkBar
          count={selected.size}
          pipeline={pipeline}
          pipelines={pipelines}
          owners={owners}
          onStage={(p, s) => void bulkStage(p, s)}
          onRemoveFromPipeline={(p) => void bulkRemoveFromPipeline(p)}
          onOwner={(ownerId) => void bulkOwner(ownerId)}
          onTags={setBulkDialog}
          onDelete={deleteSelected}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

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
        description="Their conversation and notes go too. If they message you again, they come back as a new contact."
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
        description="The contacts in it stay as they are."
        confirmLabel="Delete segment"
        destructive
        onConfirm={deleteSegment}
      />
    </>
  );
}

export { ContactsView };
