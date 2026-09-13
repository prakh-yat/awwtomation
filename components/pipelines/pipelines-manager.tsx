"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, GripVertical, Plus, SquareKanban, Trash2 } from "lucide-react";

import { errorMessage, pipelinesApi } from "@/components/contacts/api";
import { StageDot } from "@/components/pipelines/stage-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { colorForIndex, isStageColor, STAGE_COLOR_LABELS, STAGE_COLORS, type StageColor, stageColorClasses } from "@/lib/pipelines/colors";
import type { PipelineSummary } from "@/lib/services/pipelines";
import { cn, formatNumber } from "@/lib/utils";

const NAME_MAX = 40;
const STAGE_NAME_MAX = 24;
const MIN_STAGES = 2;
const MAX_STAGES = 12;
const MAX_PIPELINES = 20;

type DraftStage = { key: string; id?: string; name: string; color: StageColor; count: number };
type Draft = { name: string; stages: DraftStage[] };

let draftKey = 0;
const nextKey = () => `new-${++draftKey}`;

function toDraft(p: PipelineSummary): Draft {
  return {
    name: p.name,
    stages: p.stages.map((s) => ({ key: s.id, id: s.id, name: s.name, color: isStageColor(s.color) ? s.color : "gray", count: s.count })),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  if (a.name.trim() !== b.name.trim() || a.stages.length !== b.stages.length) return false;
  return a.stages.every((s, i) => s.key === b.stages[i].key && s.name.trim() === b.stages[i].name.trim() && s.color === b.stages[i].color);
}

function draftProblem(d: Draft): string | null {
  if (!d.name.trim()) return "Give the pipeline a name.";
  if (d.stages.length < MIN_STAGES) return `Keep at least ${MIN_STAGES} stages.`;
  if (d.stages.some((s) => !s.name.trim())) return "Every stage needs a name.";
  const names = d.stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Two stages have the same name.";
  return null;
}

function ColorPicker({ value, onChange, label, disabled }: { value: StageColor; onChange: (c: StageColor) => void; label: string; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Colour for ${label}: ${STAGE_COLOR_LABELS[value]}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        >
          <span className={cn("h-3.5 w-3.5 rounded-full", stageColorClasses(value).dot)} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div role="radiogroup" aria-label="Stage colour" className="grid grid-cols-5 gap-1">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === value}
              aria-label={STAGE_COLOR_LABELS[c]}
              title={STAGE_COLOR_LABELS[c]}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                c === value && "bg-accent ring-1 ring-foreground/20",
              )}
            >
              <span className={cn("h-4 w-4 rounded-full", stageColorClasses(c).dot)} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PipelineEditor({
  pipeline,
  canManage,
  onSaved,
  onDeleted,
}: {
  pipeline: PipelineSummary;
  canManage: boolean;
  onSaved: (p: PipelineSummary) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(pipeline));
  const [source, setSource] = React.useState(pipeline);
  const [saving, setSaving] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [moveTo, setMoveTo] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  if (source !== pipeline) {
    setSource(pipeline);
    setDraft(toDraft(pipeline));
  }

  const saved = React.useMemo(() => toDraft(pipeline), [pipeline]);
  const dirty = !sameDraft(draft, saved);
  const problem = draftProblem(draft);
  const keptKeys = new Set(draft.stages.map((s) => s.key));
  const removedWithContacts = saved.stages.filter((s) => !keptKeys.has(s.key) && s.count > 0);
  const removedCount = removedWithContacts.reduce((sum, s) => sum + s.count, 0);

  function updateStage(key: string, patch: Partial<DraftStage>) {
    setDraft((d) => ({ ...d, stages: d.stages.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  }

  function moveStage(from: number, to: number) {
    if (to < 0 || to >= draft.stages.length || from === to) return;
    setDraft((d) => {
      const stages = [...d.stages];
      const [item] = stages.splice(from, 1);
      stages.splice(to, 0, item);
      return { ...d, stages };
    });
  }

  function addStage() {
    setDraft((d) => ({ ...d, stages: [...d.stages, { key: nextKey(), name: "", color: colorForIndex(d.stages.length), count: 0 }] }));
    // Focus the new name field once it renders.
    window.setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>(`[data-stage-input="${pipeline.id}"]`);
      inputs[inputs.length - 1]?.focus();
    }, 0);
  }

  async function save(moveRemovedTo?: string) {
    if (problem) return;
    setSaving(true);
    try {
      const next = await pipelinesApi.update(pipeline.id, {
        name: draft.name.trim(),
        stages: draft.stages.map((s) => ({ ...(s.id ? { id: s.id } : {}), name: s.name.trim(), color: s.color })),
        ...(moveRemovedTo ? { moveRemovedTo } : {}),
      });
      onSaved(next);
      setMoveOpen(false);
      toast.success(`Saved ${next.name}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the pipeline"));
    } finally {
      setSaving(false);
    }
  }

  function requestSave() {
    if (problem) return;
    if (removedCount > 0) {
      const firstKept = draft.stages[0];
      setMoveTo(firstKept.id ?? firstKept.name.trim());
      setMoveOpen(true);
      return;
    }
    void save();
  }

  async function remove() {
    try {
      await pipelinesApi.remove(pipeline.id);
      toast.success(`Deleted ${pipeline.name}`);
      onDeleted(pipeline.id);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the pipeline"));
      throw err;
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b p-5">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label htmlFor={`pipeline-name-${pipeline.id}`}>Pipeline name</Label>
          <Input
            id={`pipeline-name-${pipeline.id}`}
            value={draft.name}
            maxLength={NAME_MAX}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            disabled={!canManage}
          />
        </div>
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href={`/contacts?pipelineId=${encodeURIComponent(pipeline.id)}&view=board`}>
            <SquareKanban />
            Open board
          </Link>
        </Button>
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Stages</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">In the order contacts move through them. Drag to reorder.</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {draft.stages.length} of {MAX_STAGES}
          </span>
        </div>

        <ol className="space-y-1.5">
          {draft.stages.map((stage, index) => (
            <li
              key={stage.key}
              draggable={canManage}
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/stage-index", String(index));
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveStage(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "group flex items-center gap-2 rounded-lg border bg-background p-1.5 pr-2 transition-colors",
                dragIndex === index && "opacity-50",
                overIndex === index && dragIndex !== index && "border-foreground/40 bg-muted/40",
              )}
            >
              {canManage ? (
                <span className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing" aria-hidden>
                  <GripVertical className="h-4 w-4" />
                </span>
              ) : null}
              <ColorPicker value={stage.color} label={stage.name || "new stage"} onChange={(color) => updateStage(stage.key, { color })} disabled={!canManage} />
              <Input
                data-stage-input={pipeline.id}
                value={stage.name}
                maxLength={STAGE_NAME_MAX}
                placeholder="Stage name"
                aria-label={`Stage ${index + 1} name`}
                onChange={(e) => updateStage(stage.key, { name: e.target.value })}
                disabled={!canManage}
                className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-2 text-[13px] shadow-none hover:border-input focus-visible:border-foreground"
              />
              <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                {stage.id ? `${formatNumber(stage.count)} ${stage.count === 1 ? "contact" : "contacts"}` : "New"}
              </span>
              {canManage ? (
                <div className="flex shrink-0 items-center">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => moveStage(index, index - 1)} disabled={index === 0} aria-label={`Move ${stage.name || "stage"} up`}>
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => moveStage(index, index + 1)}
                    disabled={index === draft.stages.length - 1}
                    aria-label={`Move ${stage.name || "stage"} down`}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDraft((d) => ({ ...d, stages: d.stages.filter((s) => s.key !== stage.key) }))}
                    disabled={draft.stages.length <= MIN_STAGES}
                    aria-label={`Delete ${stage.name || "stage"}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        {canManage ? (
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addStage} disabled={draft.stages.length >= MAX_STAGES}>
            <Plus />
            Add stage
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                <Trash2 />
                Delete pipeline
              </Button>
            }
            title={`Delete ${pipeline.name}?`}
            description={
              pipeline.total > 0
                ? `The ${formatNumber(pipeline.total)} ${pipeline.total === 1 ? "contact" : "contacts"} in it stay in your contacts. Only their place in this pipeline is removed. Automation steps that use it stop working until you pick another pipeline.`
                : "Automation steps that use it stop working until you pick another pipeline."
            }
            confirmLabel="Delete pipeline"
            destructive
            onConfirm={remove}
          />
          <div className="flex items-center gap-2">
            {problem && dirty ? <span className="text-xs text-destructive">{problem}</span> : null}
            {dirty ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDraft(saved)} disabled={saving}>
                Discard
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={requestSave} loading={saving} disabled={!dirty || Boolean(problem)}>
              Save changes
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={moveOpen} onOpenChange={(open) => !saving && setMoveOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move {formatNumber(removedCount)} {removedCount === 1 ? "contact" : "contacts"}</DialogTitle>
            <DialogDescription>
              {removedWithContacts.map((s) => s.name).join(", ")} {removedWithContacts.length === 1 ? "still has" : "still have"} contacts. Pick the stage they move to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`move-to-${pipeline.id}`}>Move them to</Label>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger id={`move-to-${pipeline.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {draft.stages.map((s) => (
                  <SelectItem key={s.key} value={s.id ?? s.name.trim()}>
                    <span className="flex items-center gap-2">
                      <StageDot color={s.color} />
                      {s.name.trim()}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save(moveTo)} loading={saving} disabled={!moveTo}>
              Move and save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Pipelines for the workspace: pick one on the left, edit its name and stages
 * on the right. Members can look; admins and owners can change them.
 */
export function PipelinesManager({ initialPipelines, canManage }: { initialPipelines: PipelineSummary[]; canManage: boolean }) {
  const router = useRouter();
  const [pipelines, setPipelines] = React.useState(initialPipelines);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialPipelines[0]?.id ?? null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const selected = pipelines.find((p) => p.id === selectedId) ?? pipelines[0] ?? null;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const pipeline = await pipelinesApi.create({ name });
      setPipelines((prev) => [...prev, pipeline]);
      setSelectedId(pipeline.id);
      setCreateOpen(false);
      setNewName("");
      toast.success(`Created ${pipeline.name}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't create the pipeline"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-card">
            <SquareKanban className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium">No pipelines yet</p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">A pipeline is the set of stages a contact moves through, like New, Lead and Customer.</p>
          {canManage ? (
            <Button className="mt-5" onClick={() => setCreateOpen(true)}>
              <Plus />
              New pipeline
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Pipelines" className="space-y-1">
            {pipelines.map((p) => {
              const active = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-2 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-foreground bg-card shadow-card" : "border-transparent hover:bg-accent/60",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatNumber(p.total)}</span>
                  </span>
                  {/* Stage mix: each stage's share of the pipeline, in its colour. */}
                  <span aria-hidden className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
                    {p.stages.map((s) => (
                      <span key={s.id} className={cn("h-full rounded-full", stageColorClasses(s.color).dot, p.total === 0 && "opacity-30")} style={{ flexGrow: p.total > 0 ? Math.max(s.count, p.total * 0.02) : 1 }} />
                    ))}
                  </span>
                </button>
              );
            })}
            {canManage ? (
              <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground" onClick={() => setCreateOpen(true)} disabled={pipelines.length >= MAX_PIPELINES}>
                <Plus />
                New pipeline
              </Button>
            ) : null}
          </nav>

          {selected ? (
            <PipelineEditor
              key={selected.id}
              pipeline={selected}
              canManage={canManage}
              onSaved={(next) => {
                setPipelines((prev) => prev.map((p) => (p.id === next.id ? next : p)));
                router.refresh();
              }}
              onDeleted={(id) => {
                setPipelines((prev) => prev.filter((p) => p.id !== id));
                setSelectedId(null);
                router.refresh();
              }}
            />
          ) : null}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent className="max-w-md">
          <form onSubmit={create} className="space-y-5">
            <DialogHeader>
              <DialogTitle>New pipeline</DialogTitle>
              <DialogDescription>It starts with New, Engaged, Lead, Customer and Lost. Rename, recolour or reorder them after.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="new-pipeline-name">Name</Label>
              <Input id="new-pipeline-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={NAME_MAX} placeholder="For example Wholesale" autoFocus required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" loading={creating} disabled={!newName.trim()}>
                Create pipeline
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
