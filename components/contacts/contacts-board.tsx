"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, X } from "lucide-react";

import { StageDot } from "@/components/pipelines/stage-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { stageColorClasses } from "@/lib/pipelines/colors";
import type { ContactListItem } from "@/lib/services/contacts";
import type { PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import { cn, formatNumber } from "@/lib/utils";

import { contactsApi, errorMessage } from "./api";
import { ContactAvatar } from "./contact-avatar";
import { OwnerAvatar, ownerLabel } from "./contact-details-card";
import type { ContactFilterState } from "./filters";
import { contactDisplayName, formatRelative } from "./format";

const PAGE_SIZE = 25;

type Column = { stage: PipelineStageSummary; items: ContactListItem[]; page: number; pageCount: number; count: number; loading: boolean };

function emptyColumns(pipeline: PipelineSummary): Column[] {
  return pipeline.stages.map((stage) => ({ stage, items: [], page: 1, pageCount: 1, count: 0, loading: true }));
}

function BoardCard({
  item,
  pipeline,
  stageId,
  onMove,
  onRemove,
}: {
  item: ContactListItem;
  pipeline: PipelineSummary;
  stageId: string;
  onMove: (item: ContactListItem, from: string, to: PipelineStageSummary) => void;
  onRemove: (item: ContactListItem, from: string) => void;
}) {
  const name = contactDisplayName(item);
  const handle = item.username && item.name ? `@${item.username.replace(/^@/, "")}` : null;
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/contact-id", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group cursor-grab rounded-lg border bg-card p-3 shadow-card transition-shadow hover:shadow-elevated active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <ContactAvatar name={item.name} username={item.username} avatarUrl={item.avatarUrl} platform={item.platform} size="sm" />
        <div className="min-w-0 flex-1">
          <Link href={`/contacts/${item.id}`} className="block truncate text-[13px] font-medium underline-offset-4 hover:underline">
            {name}
          </Link>
          {handle ? <p className="truncate text-xs text-muted-foreground">{handle}</p> : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 -mt-1 h-6 w-6 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Move ${name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Move to</DropdownMenuLabel>
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
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate" suppressHydrationWarning>
          {item.lastInteractionAt ? formatRelative(item.lastInteractionAt) : "No activity yet"}
        </span>
        {item.owner ? (
          <span className="flex min-w-0 items-center gap-1.5" title={`Owner: ${ownerLabel(item.owner)}`}>
            <OwnerAvatar owner={item.owner} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {item.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.tags.slice(0, 2).map((t) => (
            <span key={t} className="max-w-[8rem] truncate rounded bg-muted px-1.5 py-0.5 text-[11px]">
              {t}
            </span>
          ))}
          {item.tags.length > 2 ? <span className="text-[11px] text-muted-foreground">+{item.tags.length - 2}</span> : null}
        </div>
      ) : null}
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
                const hit = findItem(e.dataTransfer.getData("text/contact-id"));
                if (hit) void move(hit.item, hit.stageId, column.stage);
              }}
              className={cn(
                "flex max-h-[calc(100dvh-15rem)] min-h-[16rem] w-[18rem] shrink-0 flex-col rounded-xl border border-t-[3px] bg-muted/40 transition-colors",
                colors.border,
                isTarget && "bg-muted ring-2 ring-foreground/15",
              )}
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-2.5">
                <StageDot color={column.stage.color} />
                <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{column.stage.name}</h3>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground ring-1 ring-inset ring-border">{formatNumber(column.count)}</span>
              </header>
              <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 scrollbar-thin">
                {column.items.map((item) => (
                  <BoardCard key={item.id} item={item} pipeline={pipeline} stageId={column.stage.id} onMove={(i, from, to) => void move(i, from, to)} onRemove={(i, from) => void remove(i, from)} />
                ))}
                {column.loading && column.items.length === 0 ? (
                  <li className="flex justify-center py-6">
                    <Spinner size="sm" />
                  </li>
                ) : null}
                {!column.loading && column.items.length === 0 ? (
                  <li className={cn("rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground", isTarget && "border-foreground/30")}>
                    Drop a contact here
                  </li>
                ) : null}
                {column.page < column.pageCount ? (
                  <li>
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => void loadMore(column.stage.id)} loading={column.loading}>
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
