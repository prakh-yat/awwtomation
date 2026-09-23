"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import type { ContactPipelineRef, PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import { contactsApi, errorMessage } from "./api";
import { Panel } from "./panel";
import { PipelineStageMenuItems, StageSelectCell, StageTrack } from "./pipeline-controls";

/** Where the contact sits in each pipeline, with moves, removal and adding to another pipeline. */
export function ContactPipelinesCard({
  contactId,
  contactName,
  pipelines,
  entries: initialEntries,
  canManagePipelines,
}: {
  contactId: string;
  contactName: string;
  pipelines: PipelineSummary[];
  entries: ContactPipelineRef[];
  canManagePipelines: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = React.useState(initialEntries);
  const [source, setSource] = React.useState(initialEntries);
  const [busy, setBusy] = React.useState<string | null>(null);
  if (source !== initialEntries) {
    setSource(initialEntries);
    setEntries(initialEntries);
  }

  const inPipelines = pipelines.filter((p) => entries.some((e) => e.pipelineId === p.id));
  const available = pipelines.filter((p) => !entries.some((e) => e.pipelineId === p.id));

  async function setStage(pipeline: PipelineSummary, stage: PipelineStageSummary) {
    const current = entries.find((e) => e.pipelineId === pipeline.id);
    if (current?.stageId === stage.id) return;
    setBusy(pipeline.id);
    try {
      setEntries(await contactsApi.setStage(contactId, pipeline.id, stage.id));
      toast.success(current ? `Moved to ${stage.name}` : `Added to ${pipeline.name}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't change the stage"));
    } finally {
      setBusy(null);
    }
  }

  async function remove(pipeline: PipelineSummary) {
    setBusy(pipeline.id);
    try {
      setEntries(await contactsApi.removeFromPipeline(contactId, pipeline.id));
      toast.success(`Removed from ${pipeline.name}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove the contact from the pipeline"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      label="Pipelines"
      action={
        available.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="-mr-2">
                <Plus />
                Add to pipeline
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <PipelineStageMenuItems pipelines={available} onSetStage={(p, s) => void setStage(p, s)} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    >
      {pipelines.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No pipelines yet.{" "}
          {canManagePipelines ? (
            <Link href="/contacts/pipelines" className="font-semibold text-ink underline underline-offset-4">
              Create one
            </Link>
          ) : (
            "An admin can create one."
          )}
        </p>
      ) : inPipelines.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Not in a pipeline yet</p>
      ) : (
        <ul className="space-y-2">
          {inPipelines.map((p) => {
            const entry = entries.find((e) => e.pipelineId === p.id);
            return (
              <li key={p.id} className={cn("rounded-xl border p-3 transition-opacity duration-200", busy === p.id && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.name}</span>
                  <StageSelectCell
                    pipeline={p}
                    entry={entry}
                    contactName={contactName}
                    onChange={(stageId) => {
                      const stage = p.stages.find((s) => s.id === stageId);
                      if (stage) void setStage(p, stage);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="-mr-1 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void remove(p)}
                    disabled={busy === p.id}
                    aria-label={`Remove from ${p.name}`}
                    title={`Remove from ${p.name}`}
                  >
                    <X />
                  </Button>
                </div>
                <StageTrack stages={p.stages} current={entry?.stageId} className="mt-3" />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
