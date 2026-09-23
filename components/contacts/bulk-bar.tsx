"use client";

import * as React from "react";
import { ChevronUp, Minus, Plus, SquareKanban, Trash2, UserRound, X } from "lucide-react";

import { StageDot } from "@/components/pipelines/stage-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import type { PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import { OwnerAvatar, type OwnerOption, ownerLabel } from "./contact-details-card";
import { PipelineStageMenuItems } from "./pipeline-controls";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A pill button that reads on the ink bar. */
const onInk = "h-8 rounded-full px-3 text-[13px] text-white/90 hover:bg-white/10 hover:text-white focus-visible:ring-offset-ink data-[state=open]:bg-white/15 data-[state=open]:text-white";

export interface BulkBarProps {
  count: number;
  /** The pipeline being viewed; without one, the stage menu covers every pipeline. */
  pipeline: PipelineSummary | null;
  pipelines: PipelineSummary[];
  owners: OwnerOption[];
  onStage: (pipeline: PipelineSummary, stage: PipelineStageSummary) => void;
  onRemoveFromPipeline: (pipeline: PipelineSummary) => void;
  onOwner: (ownerId: string | null) => void;
  onTags: (mode: "add" | "remove") => void;
  /** Resolves once the contacts are gone; throws (after toasting) to keep the confirm open. */
  onDelete: () => Promise<void>;
  onClear: () => void;
}

function StageItems({ pipeline, pipelines, onStage, onRemoveFromPipeline }: Pick<BulkBarProps, "pipeline" | "pipelines" | "onStage" | "onRemoveFromPipeline">) {
  if (!pipeline) return <PipelineStageMenuItems pipelines={pipelines} onSetStage={onStage} onRemove={onRemoveFromPipeline} alwaysShowRemove />;
  return (
    <>
      <DropdownMenuLabel>{pipeline.name}</DropdownMenuLabel>
      {pipeline.stages.map((s) => (
        <DropdownMenuItem key={s.id} onSelect={() => onStage(pipeline, s)}>
          <StageDot color={s.color} />
          {s.name}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem destructive onSelect={() => onRemoveFromPipeline(pipeline)}>
        <X />
        Remove from {pipeline.name}
      </DropdownMenuItem>
    </>
  );
}

function OwnerItems({ owners, onOwner }: Pick<BulkBarProps, "owners" | "onOwner">) {
  return (
    <>
      <DropdownMenuLabel>Owner</DropdownMenuLabel>
      {owners.map((o) => (
        <DropdownMenuItem key={o.id} onSelect={() => onOwner(o.id)}>
          <OwnerAvatar owner={o} />
          {ownerLabel(o)}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onOwner(null)}>Remove owner</DropdownMenuItem>
    </>
  );
}

/**
 * What to do with the selected rows, floating at the foot of the window so
 * it stays in reach however far down the list the selection goes. On a phone
 * the actions fold into one menu.
 */
export function BulkBar({ count, pipeline, pipelines, owners, onStage, onRemoveFromPipeline, onOwner, onTags, onDelete, onClear }: BulkBarProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const stageLabel = pipeline ? "Move to stage" : "Add to pipeline";
  const stageProps = { pipeline, pipelines, onStage, onRemoveFromPipeline };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6">
        <section
          aria-label={`${plural(count, "contact")} selected`}
          className="rise pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-white shadow-pop"
        >
          <span className="whitespace-nowrap pr-1 text-[13px] font-semibold tabular-nums">{count} selected</span>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-white/20" />

          <div className="hidden items-center gap-0.5 sm:flex">
            {pipelines.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className={onInk}>
                    <SquareKanban />
                    {stageLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-56">
                  <StageItems {...stageProps} />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={onInk}>
                  <UserRound />
                  Assign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-52">
                <OwnerItems owners={owners} onOwner={onOwner} />
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" className={onInk} onClick={() => onTags("add")}>
              <Plus />
              Add tags
            </Button>
            <Button variant="ghost" size="sm" className={onInk} onClick={() => onTags("remove")}>
              <Minus />
              Remove tags
            </Button>
            <Button variant="ghost" size="sm" className={cn(onInk, "hover:bg-destructive")} onClick={() => setConfirmOpen(true)}>
              <Trash2 />
              Delete
            </Button>
          </div>

          <div className="flex sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={onInk}>
                  Actions
                  <ChevronUp />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-56">
                {pipelines.length > 0 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <SquareKanban className="text-muted-foreground" />
                      {stageLabel}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <StageItems {...stageProps} />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <UserRound className="text-muted-foreground" />
                    Assign
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <OwnerItems owners={owners} onOwner={onOwner} />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onSelect={() => onTags("add")}>
                  <Plus />
                  Add tags
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onTags("remove")}>
                  <Minus />
                  Remove tags
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-white/20" />
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </section>
      </div>

      <ConfirmDialog
        trigger={null}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${plural(count, "contact")}?`}
        description="Their conversations and notes go too. Anyone who messages you again comes back as a new contact."
        confirmLabel="Delete contacts"
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}
