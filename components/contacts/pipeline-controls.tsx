"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Settings2, SquareKanban, Users, X } from "lucide-react";

import { StageDot, StagePill } from "@/components/pipelines/stage-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { stageColorClasses } from "@/lib/pipelines/colors";
import type { ContactPipelineRef, PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import { cn, formatNumber } from "@/lib/utils";

/** A pipeline's first few stage colours, overlapped: tells pipelines apart at a glance. */
function PipelineMark({ pipeline }: { pipeline: PipelineSummary }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center">
      {pipeline.stages.slice(0, 4).map((s, i) => (
        <span key={s.id} className={cn("h-2.5 w-2.5 rounded-full ring-2 ring-popover", stageColorClasses(s.color).dot, i > 0 && "-ml-1")} />
      ))}
    </span>
  );
}

/**
 * Chooses what the contacts page shows: everyone, or the contacts in one
 * pipeline. Admins also get the way into pipeline management here.
 */
export function PipelineSwitcher({
  pipelines,
  value,
  totalCount,
  canManage,
  onChange,
}: {
  pipelines: PipelineSummary[];
  /** Pipeline id, or "" for all contacts. */
  value: string;
  totalCount: number;
  canManage: boolean;
  onChange: (pipelineId: string) => void;
}) {
  const current = pipelines.find((p) => p.id === value) ?? null;
  const label = value ? (current?.name ?? "Pipeline removed") : "All contacts";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 max-w-[15rem] gap-2 text-[13px]", value && "border-foreground")} aria-label={`Showing ${label}`}>
          {value ? <SquareKanban className="text-muted-foreground" /> : <Users className="text-muted-foreground" />}
          <span className="truncate font-medium">{label}</span>
          <ChevronDown className="-mr-1 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={() => onChange("")}>
          <Users className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">All contacts</span>
          <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(totalCount)}</span>
          <Check className={cn(value === "" ? "opacity-100" : "opacity-0")} />
        </DropdownMenuItem>
        {pipelines.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Pipelines</DropdownMenuLabel>
            {pipelines.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => onChange(p.id)}>
                <PipelineMark pipeline={p} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(p.total)}</span>
                <Check className={cn(value === p.id ? "opacity-100" : "opacity-0")} />
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/contacts/pipelines">
                <Settings2 />
                {pipelines.length > 0 ? "Manage pipelines" : "Create a pipeline"}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Stage tabs above the list: every stage of the pipeline with how many contacts match. */
export function StageStrip({
  pipeline,
  counts,
  value,
  onChange,
}: {
  pipeline: PipelineSummary;
  /** Filtered counts by stage id; the pipeline's own totals are shown until they load. */
  counts: Record<string, number> | null;
  value: string;
  onChange: (stageId: string) => void;
}) {
  const countFor = (s: PipelineStageSummary) => counts?.[s.id] ?? (counts ? 0 : s.count);
  const total = pipeline.stages.reduce((sum, s) => sum + countFor(s), 0);

  return (
    <div role="radiogroup" aria-label={`${pipeline.name} stages`} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 scrollbar-none">
      <StageTab label="All stages" count={total} checked={value === ""} onClick={() => onChange("")} />
      {pipeline.stages.map((s) => (
        <StageTab key={s.id} label={s.name} color={s.color} count={countFor(s)} checked={value === s.id} onClick={() => onChange(value === s.id ? "" : s.id)} />
      ))}
    </div>
  );
}

function StageTab({ label, color, count, checked, onClick }: { label: string; color?: string; count: number; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "border-foreground bg-foreground text-background" : "bg-background text-foreground hover:bg-accent",
      )}
    >
      {color ? <StageDot color={color} className={cn(checked && "ring-2 ring-background/30")} /> : null}
      <span className="whitespace-nowrap font-medium">{label}</span>
      <span className={cn("tabular-nums", checked ? "text-background/70" : "text-muted-foreground")}>{formatNumber(count)}</span>
    </button>
  );
}

/** In a pipeline view: the contact's stage in that pipeline, changeable in place. */
export function StageSelectCell({
  pipeline,
  entry,
  contactName,
  onChange,
}: {
  pipeline: PipelineSummary;
  entry: ContactPipelineRef | undefined;
  contactName: string;
  onChange: (stageId: string) => void;
}) {
  if (!entry) return <span className="text-[13px] text-muted-foreground">Not in this pipeline</span>;
  return (
    <Select value={entry.stageId} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-7 w-auto min-w-[7rem] max-w-[11rem] gap-1.5 rounded-full border-0 px-2.5 text-xs font-medium shadow-none ring-1 ring-inset focus:ring-2 [&>svg]:h-3 [&>svg]:w-3",
          stageColorClasses(entry.stageColor).pill,
        )}
        aria-label={`Stage for ${contactName}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {pipeline.stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <StageDot color={s.color} />
              {s.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Stage submenus for every pipeline: pick a stage to add or move the contact
 * there, or take them out. Shared by the row menu and the bulk bar.
 */
export function PipelineStageMenuItems({
  pipelines,
  entries = [],
  onSetStage,
  onRemove,
  alwaysShowRemove = false,
}: {
  pipelines: PipelineSummary[];
  /** Where the contact already is (single contact only). */
  entries?: ContactPipelineRef[];
  onSetStage: (pipeline: PipelineSummary, stage: PipelineStageSummary) => void;
  onRemove?: (pipeline: PipelineSummary) => void;
  /** Offer "Remove" on every pipeline, for a selection whose places vary. */
  alwaysShowRemove?: boolean;
}) {
  return (
    <>
      {pipelines.map((p) => {
        const entry = entries.find((e) => e.pipelineId === p.id);
        return (
          <DropdownMenuSub key={p.id}>
            <DropdownMenuSubTrigger>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {entry ? (
                <span className="flex max-w-[45%] items-center gap-1.5 text-xs text-muted-foreground">
                  <StageDot color={entry.stageColor} />
                  <span className="truncate">{entry.stageName}</span>
                </span>
              ) : null}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {p.stages.map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => onSetStage(p, s)}>
                  <StageDot color={s.color} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {entry?.stageId === s.id ? <Check /> : null}
                </DropdownMenuItem>
              ))}
              {onRemove && (entry || alwaysShowRemove) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onRemove(p)}>
                    <X />
                    Remove from {p.name}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
    </>
  );
}

/** In the all-contacts view: the pipelines a contact is in, with a menu to change them. */
export function PipelinesCell({
  pipelines,
  entries,
  contactName,
  onSetStage,
  onRemove,
}: {
  pipelines: PipelineSummary[];
  entries: ContactPipelineRef[];
  contactName: string;
  onSetStage: (pipeline: PipelineSummary, stage: PipelineStageSummary) => void;
  onRemove: (pipeline: PipelineSummary) => void;
}) {
  const [first, ...rest] = entries;
  if (pipelines.length === 0) return <span className="text-[13px] text-muted-foreground">No pipelines</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Pipelines for ${contactName}`}
          className="-mx-1 flex max-w-full items-center gap-1.5 rounded-md px-1 py-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          {first ? (
            <>
              <StagePill name={first.stageName} color={first.stageColor} title={`${first.pipelineName}: ${first.stageName}`} className="min-w-0" />
              {rest.length > 0 ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={rest.map((e) => `${e.pipelineName}: ${e.stageName}`).join("\n")}>
                  +{rest.length}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[13px] text-muted-foreground">Add to pipeline</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Pipelines</DropdownMenuLabel>
        <PipelineStageMenuItems pipelines={pipelines} entries={entries} onSetStage={onSetStage} onRemove={onRemove} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
