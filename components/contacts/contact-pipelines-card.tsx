"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import type { ContactPipelineRef, PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";

import { contactsApi, errorMessage } from "./api";
import { PipelineStageMenuItems, StageSelectCell } from "./pipeline-controls";

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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>Pipelines</CardTitle>
        {available.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="-mr-2 h-7 text-xs">
                <Plus />
                Add to pipeline
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <PipelineStageMenuItems pipelines={available} onSetStage={(p, s) => void setStage(p, s)} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardHeader>
      <CardContent>
        {pipelines.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No pipelines yet.{" "}
            {canManagePipelines ? (
              <Link href="/contacts/pipelines" className="text-foreground underline underline-offset-4">
                Create one
              </Link>
            ) : (
              "An admin can create one."
            )}
          </p>
        ) : inPipelines.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Not in a pipeline yet.</p>
        ) : (
          <ul className="divide-y">
            {inPipelines.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                <StageSelectCell
                  pipeline={p}
                  entry={entries.find((e) => e.pipelineId === p.id)}
                  contactName={contactName}
                  onChange={(stageId) => {
                    const stage = p.stages.find((s) => s.id === stageId);
                    if (stage) void setStage(p, stage);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  onClick={() => void remove(p)}
                  disabled={busy === p.id}
                  aria-label={`Remove from ${p.name}`}
                  title={`Remove from ${p.name}`}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
