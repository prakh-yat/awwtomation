"use client";

import { StageDot } from "@/components/pipelines/stage-badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PipelineSummary } from "@/lib/services/pipelines";

const NONE = "__none__";

export type PipelinePlace = { pipelineId: string; stageId: string };

/**
 * A pipeline select and a stage select for forms. "" in both means the
 * contact isn't added to a pipeline. Picking a pipeline starts at its first stage.
 */
export function PipelineStageFields({
  idPrefix,
  pipelines,
  value,
  onChange,
  stageLabel = "Stage",
  allowNone = true,
}: {
  idPrefix: string;
  pipelines: PipelineSummary[];
  value: PipelinePlace;
  onChange: (next: PipelinePlace) => void;
  stageLabel?: string;
  allowNone?: boolean;
}) {
  const pipeline = pipelines.find((p) => p.id === value.pipelineId) ?? null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-pipeline`}>Pipeline</Label>
        <Select
          value={value.pipelineId || NONE}
          onValueChange={(v) => {
            const next = pipelines.find((p) => p.id === v);
            onChange(next ? { pipelineId: next.id, stageId: next.stages[0]?.id ?? "" } : { pipelineId: "", stageId: "" });
          }}
        >
          <SelectTrigger id={`${idPrefix}-pipeline`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowNone ? (
              <>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">Not in a pipeline</span>
                </SelectItem>
                {pipelines.length > 0 ? <SelectSeparator /> : null}
              </>
            ) : null}
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-stage`} className={pipeline ? undefined : "text-muted-foreground"}>
          {stageLabel}
        </Label>
        <Select value={value.stageId} onValueChange={(stageId) => onChange({ ...value, stageId })} disabled={!pipeline}>
          <SelectTrigger id={`${idPrefix}-stage`}>
            <SelectValue placeholder={pipeline ? "Pick a stage" : "Pick a pipeline first"} />
          </SelectTrigger>
          <SelectContent>
            {pipeline?.stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <StageDot color={s.color} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
