"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, SquareKanban, Trash2 } from "lucide-react";

import { errorMessage, pipelinesApi } from "@/components/contacts/api";
import { riseStyle } from "@/components/contacts/rise";
import { StageDot, StagePill } from "@/components/pipelines/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { colorForIndex, DEFAULT_STAGES, isStageColor, STAGE_COLOR_LABELS, STAGE_COLORS, type StageColor, stageColorClasses } from "@/lib/pipelines/colors";
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

/** Each stage's share of the pipeline, in its colour. */
function StageMix({ pipeline, className }: { pipeline: PipelineSummary; className?: string }) {
  return (
    <span aria-hidden className={cn("flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full", className)}>
      {pipeline.stages.map((s) => (
        <span
          key={s.id}
          className={cn("h-full rounded-full", stageColorClasses(s.color).dot, pipeline.total === 0 && "opacity-30")}
          style={{ flexGrow: pipeline.total > 0 ? Math.max(s.count, pipeline.total * 0.02) : 1 }}
        />
      ))}
    </span>
  );
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
          className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none data-[state=open]:bg-fog"
        >
          <span className={cn("h-5 w-5 rounded-md transition-transform duration-200 ease-soft group-hover:scale-110 group-data-[state=open]:scale-110", stageColorClasses(value).dot)} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <p className="brand-label mb-2.5 text-muted-foreground">Colour</p>
        <div role="radiogroup" aria-label="Stage colour" className="grid grid-cols-5 gap-2">
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
                "flex h-8 w-8 items-center justify-center rounded-full text-white outline-none transition-transform duration-150 ease-soft hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                stageColorClasses(c).dot,
                c === value && "ring-2 ring-ink ring-offset-2 ring-offset-popover",
              )}
            >
              {c === value ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
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
    <section aria-label={pipeline.name} className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-end gap-3 border-b p-5">
        <div className="min-w-[12rem] flex-1 space-y-2">
          <label htmlFor={`pipeline-name-${pipeline.id}`} className="brand-label block text-muted-foreground">
            Pipeline name
          </label>
          <Input
            id={`pipeline-name-${pipeline.id}`}
            value={draft.name}
            maxLength={NAME_MAX}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            disabled={!canManage}
            className="text-[15px] font-semibold"
          />
        </div>
        <Button asChild variant="outline" className="h-10">
          <Link href={`/contacts?pipelineId=${encodeURIComponent(pipeline.id)}&view=board`}>
            <SquareKanban />
            Open board
          </Link>
        </Button>
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="brand-label text-muted-foreground">Stages</h3>
          <span className="brand-label tabular-nums text-muted-foreground">
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
                "group relative flex items-center gap-1.5 rounded-xl border bg-background p-1.5 pr-2 transition-[border-color,background-color,opacity] duration-150",
                canManage && "hover:border-ink/20",
                dragIndex === index && "opacity-40",
                overIndex === index && dragIndex !== index && "border-dashed border-ink/50 bg-fog",
              )}
            >
              {canManage ? (
                <span className="hidden h-9 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 transition-colors group-hover:text-ink active:cursor-grabbing sm:flex" aria-hidden>
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
                className="h-9 min-w-0 flex-1 rounded-lg border-transparent bg-transparent px-2 text-[13px] font-semibold hover:border-input focus-visible:border-ink"
              />
              <span className="hidden w-24 shrink-0 justify-end text-[12px] tabular-nums text-muted-foreground sm:flex">
                {stage.id ? `${formatNumber(stage.count)} ${stage.count === 1 ? "contact" : "contacts"}` : <Badge variant="green">New</Badge>}
              </span>
              {canManage ? (
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-muted-foreground hover:text-ink"
                    onClick={() => moveStage(index, index - 1)}
                    disabled={index === 0}
                    aria-label={`Move ${stage.name || "stage"} up`}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-muted-foreground hover:text-ink"
                    onClick={() => moveStage(index, index + 1)}
                    disabled={index === draft.stages.length - 1}
                    aria-label={`Move ${stage.name || "stage"} down`}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
          <Button type="button" variant="outline" size="sm" className="mt-3 border-dashed" onClick={addStage} disabled={draft.stages.length >= MAX_STAGES}>
            <Plus />
            Add stage
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-fog/50 px-5 py-3">
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 />
                Delete pipeline
              </Button>
            }
            title={`Delete ${pipeline.name}?`}
            description={
              pipeline.total > 0
                ? `The ${formatNumber(pipeline.total)} ${pipeline.total === 1 ? "contact" : "contacts"} in it stay in your contacts. Automation steps that use it stop working until you pick another pipeline.`
                : "Automation steps that use it stop working until you pick another pipeline."
            }
            confirmLabel="Delete pipeline"
            destructive
            onConfirm={remove}
          />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {problem && dirty ? <span className="text-[12px] font-medium text-destructive">{problem}</span> : null}
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
            <DialogTitle>
              Move {formatNumber(removedCount)} {removedCount === 1 ? "contact" : "contacts"}
            </DialogTitle>
            <DialogDescription>
              {removedWithContacts.map((s) => s.name).join(", ")} {removedWithContacts.length === 1 ? "still has" : "still have"} contacts.
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
    </section>
  );
}

/**
 * Pipelines for the workspace: pick one, then edit its name and stages
 * beside it. Members can look; admins and owners can change them.
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
      <PageHeader
        title="Contacts"
        actions={
          canManage && pipelines.length > 0 ? (
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={pipelines.length >= MAX_PIPELINES}>
              <Plus />
              New pipeline
            </Button>
          ) : null
        }
      />

      {pipelines.length === 0 ? (
        <EmptyState
          tone="green"
          icon={SquareKanban}
          title="No pipelines yet"
          description={canManage ? undefined : "An admin can create one."}
          action={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                New pipeline
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <nav aria-label="Pipelines" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {pipelines.map((p, i) => {
              const active = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-current={active ? "true" : undefined}
                  style={riseStyle(i)}
                  className={cn(
                    "rise flex min-w-[13rem] shrink-0 flex-col gap-3 rounded-2xl border p-4 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-w-0",
                    active ? "border-ink bg-ink text-white" : "bg-card hover:border-ink/30",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold">{p.name}</span>
                    <span className={cn("shrink-0 text-[12px] font-medium tabular-nums", active ? "text-white/60" : "text-muted-foreground")}>{formatNumber(p.total)}</span>
                  </span>
                  <StageMix pipeline={p} />
                  <span className={cn("brand-label", active ? "text-white/60" : "text-muted-foreground")}>
                    {p.stages.length} {p.stages.length === 1 ? "stage" : "stages"}
                  </span>
                </button>
              );
            })}
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
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <form onSubmit={create} className="space-y-5">
            <DialogHeader>
              <DialogTitle>New pipeline</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="new-pipeline-name">Name</Label>
              <Input id="new-pipeline-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={NAME_MAX} placeholder="For example Wholesale" autoFocus required />
            </div>
            <div className="space-y-2">
              <p className="brand-label text-muted-foreground">Starts with</p>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_STAGES.map((s) => (
                  <StagePill key={s.name} name={s.name} color={s.color} />
                ))}
              </div>
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
