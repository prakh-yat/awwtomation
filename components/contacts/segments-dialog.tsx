"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/utils";

import { errorMessage } from "./api";

const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;

export interface SegmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "create" saves the current filters as a new segment; "rename" edits name/description only. */
  mode: "create" | "rename";
  initialName?: string;
  initialDescription?: string | null;
  /** Live count of the filters being saved (create mode) — shown so the user knows what they're naming. */
  count?: number | null;
  /** Human summary of the filters (create mode). */
  summary?: string;
  /** Resolve to close; throw (after toasting) to keep the dialog open. */
  onSubmit: (values: { name: string; description: string | null }) => Promise<void>;
}

/** Name + description form shared by "Save as segment" and "Rename". */
function SegmentFormDialog({ open, onOpenChange, mode, initialName = "", initialDescription = null, count, summary, onSubmit }: SegmentFormDialogProps) {
  const [name, setName] = React.useState(initialName);
  const [description, setDescription] = React.useState(initialDescription ?? "");
  const [pending, setPending] = React.useState(false);

  // Reset to the caller's values each time it opens (the same dialog serves every row).
  React.useEffect(() => {
    if (!open) return;
    setName(initialName);
    setDescription(initialDescription ?? "");
  }, [open, initialName, initialDescription]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      toast.error("Give the segment a name");
      return;
    }
    setPending(true);
    try {
      await onSubmit({ name: clean, description: description.trim() || null });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, mode === "create" ? "Couldn't save the segment" : "Couldn't rename the segment"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Save as segment" : "Rename segment"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Segments are saved filters. Contacts move in and out automatically as they match, and broadcasts can target them."
                : "The segment keeps its filters; only the label changes."}
            </DialogDescription>
          </DialogHeader>

          {mode === "create" && summary ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-[13px]">
              <p className="truncate text-muted-foreground" title={summary}>
                {summary}
              </p>
              {typeof count === "number" ? (
                <p className="mt-0.5 font-medium tabular-nums">
                  {formatNumber(count)} contact{count === 1 ? "" : "s"} right now
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="segment-name">Name</Label>
            <Input
              id="segment-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Warm leads"
              maxLength={NAME_MAX}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="segment-description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="segment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who is in here and why it matters"
              rows={2}
              maxLength={DESCRIPTION_MAX}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {mode === "create" ? "Save segment" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { SegmentFormDialog };
