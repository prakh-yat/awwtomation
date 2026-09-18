"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import type { ImportMapping, ImportPreview, ImportResult } from "@/lib/services/contact-import";
import type { ContactChannelSummary } from "@/lib/services/contacts";
import type { PipelineSummary } from "@/lib/services/pipelines";
import { cn, formatNumber } from "@/lib/utils";

import { contactsApi, errorMessage } from "./api";
import { PipelineStageFields } from "./pipeline-stage-fields";
import { TagInput } from "./tag-input";

const MAX_BYTES = 2 * 1024 * 1024;
const SKIP = "__skip__";

const FIELDS: Array<{ key: keyof ImportMapping; label: string }> = [
  { key: "name", label: "Name" },
  { key: "username", label: "Username" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "stage", label: "Stage" },
  { key: "tags", label: "Tags" },
];

type Step = { kind: "file" } | { kind: "map"; csv: string; fileName: string; preview: ImportPreview } | { kind: "done"; result: ImportResult };

function accountLabel(c: Pick<ContactChannelSummary, "username" | "name" | "platform">): string {
  if (c.username) return `@${c.username.replace(/^@/, "")}`;
  return c.name ?? (c.platform === "INSTAGRAM" ? "Instagram account" : "Facebook Page");
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export function ImportContactsDialog({
  open,
  onOpenChange,
  channels,
  pipelines,
  defaultPipelineId,
  allTags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: ContactChannelSummary[];
  pipelines: PipelineSummary[];
  /** The pipeline being viewed; imports go there unless changed. */
  defaultPipelineId: string | null;
  allTags: string[];
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [step, setStep] = React.useState<Step>({ kind: "file" });
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [mapping, setMapping] = React.useState<ImportMapping>({ name: null, username: null, email: null, phone: null, stage: null, tags: null });
  const [channelId, setChannelId] = React.useState(channels[0]?.id ?? "");
  const [place, setPlace] = React.useState({ pipelineId: "", stageId: "" });
  const [addTags, setAddTags] = React.useState<string[]>([]);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep({ kind: "file" });
      setChannelId(channels[0]?.id ?? "");
      const startPipeline = pipelines.find((p) => p.id === defaultPipelineId);
      setPlace(startPipeline ? { pipelineId: startPipeline.id, stageId: startPipeline.stages[0]?.id ?? "" } : { pipelineId: "", stageId: "" });
      setAddTags([]);
    }
  }

  async function readFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("Files can be up to 2 MB. Split larger lists into several files.");
      return;
    }
    setBusy(true);
    try {
      const csv = await file.text();
      const preview = await contactsApi.previewImport(csv);
      setMapping(preview.mapping);
      setStep({ kind: "map", csv, fileName: file.name, preview });
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't read that file"));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (step.kind !== "map" || !channelId) return;
    setBusy(true);
    try {
      const result = await contactsApi.runImport({
        csv: step.csv,
        channelId,
        mapping,
        ...(place.pipelineId ? { pipelineId: place.pipelineId, defaultStageId: place.stageId || undefined } : {}),
        addTags,
      });
      setStep({ kind: "done", result });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't import the file"));
    } finally {
      setBusy(false);
    }
  }

  const mapped = mapping.name !== null || mapping.username !== null || mapping.email !== null || mapping.phone !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className={cn(step.kind === "map" ? "max-w-2xl" : "max-w-md")}>
        {step.kind === "file" ? (
          <>
            <DialogHeader>
              <DialogTitle>Import contacts</DialogTitle>
              <DialogDescription>Upload a CSV file with a header row, for example exported from a spreadsheet or another tool. Up to 5,000 contacts per file.</DialogDescription>
            </DialogHeader>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) void readFile(file);
              }}
              disabled={busy}
              className={cn(
                "flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                dragging ? "border-foreground bg-muted/60" : "hover:bg-muted/40",
              )}
            >
              <FileUp className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <span className="mt-3 text-sm font-medium">{busy ? "Reading file…" : "Choose a CSV file"}</span>
              <span className="mt-1 text-xs text-muted-foreground">or drop it here</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void readFile(file);
              }}
            />
          </>
        ) : null}

        {step.kind === "map" ? (
          <>
            <DialogHeader>
              <DialogTitle>Match your columns</DialogTitle>
              <DialogDescription>
                {step.fileName} has {plural(step.preview.rowCount, "contact")}. Pick the column that holds each detail. Rows that match an existing email or username are skipped.
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Detail</th>
                    <th className="px-3 py-2 text-left font-medium">Column in your file</th>
                    <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">First row</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {FIELDS.map((field) => {
                    const index = mapping[field.key];
                    const sample = index === null ? "" : (step.preview.rows[0]?.[index] ?? "");
                    return (
                      <tr key={field.key}>
                        <td className="px-3 py-2 font-medium">{field.label}</td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={index === null ? SKIP : String(index)}
                            onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === SKIP ? null : Number(v) }))}
                          >
                            <SelectTrigger className="h-8 text-[13px]" aria-label={`Column for ${field.label}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SKIP}>
                                <span className="text-muted-foreground">Don&apos;t import</span>
                              </SelectItem>
                              {step.preview.headers.map((h, i) => (
                                <SelectItem key={`${h}-${i}`} value={String(i)}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="hidden max-w-[200px] truncate px-3 py-2 text-muted-foreground sm:table-cell" title={sample}>
                          {sample || "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {channels.length > 1 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="import-account">Add to account</Label>
                  <Select value={channelId} onValueChange={setChannelId}>
                    <SelectTrigger id="import-account">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <PlatformIcon platform={c.platform} size={13} className="text-muted-foreground" />
                            {accountLabel(c)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {pipelines.length > 0 ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <PipelineStageFields
                    idPrefix="import"
                    pipelines={pipelines}
                    value={place}
                    onChange={setPlace}
                    stageLabel={mapping.stage === null ? "Stage" : "Stage when a row has none"}
                  />
                  {mapping.stage !== null && !place.pipelineId ? (
                    <p className="text-xs text-muted-foreground">Pick a pipeline to use the Stage column from your file.</p>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="import-tags">Tag everyone in this file</Label>
                <TagInput id="import-tags" value={addTags} onChange={setAddTags} suggestions={allTags} placeholder="Optional, e.g. trade-fair-2026" />
              </div>
            </div>

            <DialogFooter className="items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep({ kind: "file" })} disabled={busy}>
                Choose another file
              </Button>
              <Button type="button" onClick={() => void runImport()} loading={busy} disabled={!mapped || !channelId}>
                Import {plural(step.preview.rowCount, "contact")}
              </Button>
            </DialogFooter>
            {!mapped ? <p className="-mt-2 text-right text-xs text-muted-foreground">Match at least a name, username, email or phone column.</p> : null}
          </>
        ) : null}

        {step.kind === "done" ? (
          <>
            <DialogHeader>
              <DialogTitle>{step.result.created > 0 ? `Imported ${plural(step.result.created, "contact")}` : "No contacts were imported"}</DialogTitle>
              <DialogDescription>
                {[
                  step.result.duplicates > 0 ? `${plural(step.result.duplicates, "row")} matched someone already in your contacts.` : null,
                  step.result.invalid > 0 ? `${plural(step.result.invalid, "row")} couldn't be read.` : null,
                ]
                  .filter(Boolean)
                  .join(" ") || "Every row was added."}
              </DialogDescription>
            </DialogHeader>
            {step.result.errors.length > 0 ? (
              <ul className="max-h-48 divide-y overflow-auto rounded-lg border text-[13px]">
                {step.result.errors.map((e) => (
                  <li key={`${e.row}-${e.reason}`} className="flex gap-3 px-3 py-2">
                    <span className="w-14 shrink-0 tabular-nums text-muted-foreground">Row {e.row}</span>
                    <span className="min-w-0 break-words">{e.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
