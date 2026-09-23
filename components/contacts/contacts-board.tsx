"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, X } from "lucide-react";

import { StageDot } from "@/components/pipelines/stage-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { stageColorClasses } from "@/lib/pipelines/colors";
import type { ContactListItem } from "@/lib/services/contacts";
import type { PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import { cn, formatNumber } from "@/lib/utils";

import { contactsApi, errorMessage } from "./api";
import { ContactAvatar } from "./contact-avatar";
import { OwnerAvatar, ownerLabel } from "./contact-details-card";
import type { ContactFilterState } from "./filters";
import { contactDisplayName, formatRelative } from "./format";
import { riseStyle } from "./rise";
import { TagChips } from "./tag-chips";

const PAGE_SIZE = 25;

type Column = { stage: PipelineStageSummary; items: ContactListItem[]; page: number; pageCount: number; count: number; loading: boolean };

function emptyColumns(pipeline: PipelineSummary): Column[] {
  return pipeline.stages.map((stage) => ({ stage, items: [], page: 1, pageCount: 1, count: 0, loading: true }));
}

function BoardCard({
  item,
  index,
  pipeline,
  stageId,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onRemove,
}: {
  item: ContactListItem;
  index: number;
  pipeline: PipelineSummary;
  stageId: string;
  /** This card is the one being dragged. */
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (item: ContactListItem, from: string, to: PipelineStageSummary) => void;
  onRemove: (item: ContactListItem, from: string) => void;
}) {
  const name = contactDisplayName(item);
  const handle = item.username && item.name ? `@${item.username.replace(/^@/, "")}` : null;
  const dragActive = React.useRef(false);
  return (
    // The entrance plays on the <li>; the card inside lifts under the pointer and fades while dragged.
    <li className="rise" style={riseStyle(index)}>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/contact-id", item.id);
          e.dataTransfer.effectAllowed = "move";
          dragActive.current = true;
          // After the browser has taken its picture of the card, so the ghost stays solid.
          window.requestAnimationFrame(() => {
            if (dragActive.current) onDragStart(item.id);
          });
        }}
        onDragEnd={() => {
          dragActive.current = false;
          onDragEnd();
        }}
        className={cn(
          "lift group cursor-grab rounded-xl border bg-card p-3 text-ink transition-[transform,box-shadow,border-color,opacity] duration-200 ease-soft active:cursor-grabbing",
          dragging && "scale-[0.98] border-dashed border-ink/25 opacity-40 hover:translate-y-0 hover:shadow-none",
        )}
      >
        <div className="flex items-start gap-2.5">
          <ContactAvatar name={item.name} username={item.username} avatarUrl={item.avatarUrl} platform={item.platform} size="sm" />
          <div className="min-w-0 flex-1">
            <Link href={`/contacts/${item.id}`} className="block truncate text-[13px] font-semibold underline-offset-4 hover:underline" draggable={false}>
              {name}
            </Link>
            {handle ? <p className="truncate text-[12px] text-muted-foreground">{handle}</p> : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-1 -mt-1 h-7 w-7 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-fog data-[state=open]:opacity-100 max-md:opacity-100"
                aria-label={`Move ${name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {pipeline.stages
                .filter((s) => s.id !== stageId)
                .map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => onMove(item, stageId, s)}>
                    <StageDot color={s.color} />
                    {s.name}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onRemove(item, stageId)}>
                <X />
                Remove from pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {item.tags.length > 0 ? <TagChips tags={item.tags} max={2} className="mt-2.5" /> : null}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed pt-2.5 text-[12px] text-muted-foreground">
          <span className="truncate" suppressHydrationWarning>
            {item.lastInteractionAt ? formatRelative(item.lastInteractionAt) : "No activity yet"}
          </span>
          {item.owner ? (
            <span className="flex min-w-0 items-center gap-1.5" title={`Owner: ${ownerLabel(item.owner)}`}>
              <OwnerAvatar owner={item.owner} className="h-5 w-5" />
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * One pipeline as a board: a column per stage, filtered like the list. Drag a
 * card to another column, or use its menu, to change the stage. Moves are
 * optimistic and roll back if the save fails.
 */
export function ContactsBoard({
  filters,
  pipeline,
  version,
  onMoved,
}: {
  filters: ContactFilterState;
  pipeline: PipelineSummary;
  /** Bump to reload every column (after bulk changes elsewhere on the page). */
  version: number;
  onMoved: () => void;
}) {
  const [columns, setColumns] = React.useState<Column[]>(() => emptyColumns(pipeline));
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  // Stage ids and names only: the counts inside `pipeline` change after every move and must not reload the board.
  const stagesKey = pipeline.stages.map((s) => `${s.id}:${s.name}:${s.color}`).join("|");
  const pipelineRef = React.useRef(pipeline);
  React.useEffect(() => {
    pipelineRef.current = pipeline;
  }, [pipeline]);

  React.useEffect(() => {
    const current = pipelineRef.current;
    const controller = new AbortController();
    setColumns(emptyColumns(current));
    const load = async () => {
      try {
        const pages = await Promise.all(
          current.stages.map((stage) => contactsApi.list({ ...filters, pipelineId: current.id, stageId: stage.id }, { pageSize: PAGE_SIZE, signal: controller.signal })),
        );
        setColumns(current.stages.map((stage, i) => ({ stage, items: pages[i].items, page: 1, pageCount: pages[i].pageCount, count: pages[i].total, loading: false })));
      } catch (err) {
        if (controller.signal.aborted) return;
        toast.error(errorMessage(err, "Couldn't load the board"));
        setColumns((prev) => prev.map((c) => ({ ...c, loading: false })));
      }
    };
    const timer = window.setTimeout(() => void load(), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, stagesKey, version]);

  async function loadMore(stageId: string) {
    const column = columns.find((c) => c.stage.id === stageId);
    if (!column || column.page >= column.pageCount || column.loading) return;
    setColumns((prev) => prev.map((c) => (c.stage.id === stageId ? { ...c, loading: true } : c)));
    try {
      const next = await contactsApi.list({ ...filters, pipelineId: pipeline.id, stageId }, { page: column.page + 1, pageSize: PAGE_SIZE });
      setColumns((prev) =>
        prev.map((c) => {
          if (c.stage.id !== stageId) return c;
          const seen = new Set(c.items.map((i) => i.id));
          return { ...c, items: [...c.items, ...next.items.filter((i) => !seen.has(i.id))], page: next.page, pageCount: next.pageCount, count: next.total, loading: false };
        }),
      );
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load more contacts"));
      setColumns((prev) => prev.map((c) => (c.stage.id === stageId ? { ...c, loading: false } : c)));
    }
  }

  async function move(item: ContactListItem, from: string, to: PipelineStageSummary) {
    if (from === to.id) return;
    const before = columns;
    const moved: ContactListItem = {
      ...item,
      pipelines: item.pipelines.map((e) =>
        e.pipelineId === pipeline.id ? { ...e, stageId: to.id, stageName: to.name, stageColor: to.color, stagePosition: to.position } : e,
      ),
    };
    setColumns(
      before.map((c) => {
        if (c.stage.id === from) return { ...c, items: c.items.filter((i) => i.id !== item.id), count: Math.max(0, c.count - 1) };
        if (c.stage.id === to.id) return { ...c, items: [moved, ...c.items], count: c.count + 1 };
        return c;
      }),
    );
    try {
      await contactsApi.setStage(item.id, pipeline.id, to.id);
      onMoved();
    } catch (err) {
      setColumns(before);
      toast.error(errorMessage(err, "Couldn't move the contact"));
    }
  }

  async function remove(item: ContactListItem, from: string) {
    const before = columns;
    setColumns(before.map((c) => (c.stage.id === from ? { ...c, items: c.items.filter((i) => i.id !== item.id), count: Math.max(0, c.count - 1) } : c)));
    try {
      await contactsApi.removeFromPipeline(item.id, pipeline.id);
      toast.success(`${contactDisplayName(item)} removed from ${pipeline.name}`);
      onMoved();
    } catch (err) {
      setColumns(before);
      toast.error(errorMessage(err, "Couldn't remove the contact from the pipeline"));
    }
  }

  function findItem(id: string): { item: ContactListItem; stageId: string } | undefined {
    for (const c of columns) {
      const hit = c.items.find((i) => i.id === id);
      if (hit) return { item: hit, stageId: c.stage.id };
    }
    return undefined;
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-3 scrollbar-thin md:-mx-8 md:px-8">
      <div className="flex min-w-max gap-3">
        {columns.map((column) => {
          const colors = stageColorClasses(column.stage.color);
          const isTarget = dropTarget === column.stage.id;
          return (
            <section
              key={column.stage.id}
              aria-label={column.stage.name}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("text/contact-id")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget(column.stage.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setDropTarget((t) => (t === column.stage.id ? null : t));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                setDraggingId(null);
                const hit = findItem(e.dataTransfer.getData("text/contact-id"));
                if (hit) void move(hit.item, hit.stageId, column.stage);
              }}
              className={cn(
                "flex max-h-[calc(100dvh-15rem)] min-h-[18rem] w-[17.5rem] shrink-0 flex-col rounded-2xl bg-fog transition-[background-color,box-shadow] duration-200 ease-soft",
                // The column takes its stage's tint while a card hovers over it.
                isTarget && cn(colors.pill, "ring-2 ring-inset"),
              )}
            >
              <header className="px-3 pb-2 pt-3">
                <span aria-hidden className={cn("block h-1 rounded-full", colors.dot)} />
                <div className="mt-3 flex items-center gap-2 px-0.5">
                  <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{column.stage.name}</h3>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{formatNumber(column.count)}</span>
                </div>
              </header>
              <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 scrollbar-thin">
                {column.items.map((item, index) => (
                  <BoardCard
                    key={item.id}
                    item={item}
                    index={index}
                    pipeline={pipeline}
                    stageId={column.stage.id}
                    dragging={draggingId === item.id}
                    onDragStart={setDraggingId}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropTarget(null);
                    }}
                    onMove={(i, from, to) => void move(i, from, to)}
                    onRemove={(i, from) => void remove(i, from)}
                  />
                ))}
                {column.loading && column.items.length === 0
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <li key={`loading-${i}`}>
                        <Skeleton className="h-[92px] rounded-xl" />
                      </li>
                    ))
                  : null}
                {!column.loading && column.items.length === 0 ? (
                  <li
                    className={cn(
                      "rounded-xl border-2 border-dashed border-ink/10 px-3 py-8 text-center text-[12px] font-medium text-muted-foreground transition-colors",
                      isTarget && "border-current text-current",
                    )}
                  >
                    Drop a contact here
                  </li>
                ) : null}
                {column.page < column.pageCount ? (
                  <li>
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:bg-background hover:text-ink" onClick={() => void loadMore(column.stage.id)} loading={column.loading}>
                      Show more
                    </Button>
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
