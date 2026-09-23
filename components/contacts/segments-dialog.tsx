"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  /** Live count of the filters being saved (create mode): shown so the user knows what they're naming. */
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
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Save as segment" : "Rename segment"}</DialogTitle>
          </DialogHeader>

          {mode === "create" && summary ? (
            <div className="relative overflow-hidden rounded-2xl bg-green-soft px-4 py-3.5 text-green-ink">
              <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [--grid-size:24px] [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
              <div className="relative">
                {typeof count === "number" ? (
                  <p className="font-display text-[26px] leading-none tabular-nums">
                    {formatNumber(count)} <span className="text-[15px]">{count === 1 ? "contact" : "contacts"}</span>
                  </p>
                ) : (
                  <span aria-hidden className="block h-[26px] w-32 rounded-lg bg-green/10 motion-safe:animate-pulse" />
                )}
                <p className="mt-2 truncate text-[13px] opacity-80" title={summary}>
                  {summary}
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="segment-name">Name</Label>
            <Input id="segment-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Warm leads" maxLength={NAME_MAX} autoFocus autoComplete="off" />
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

          <DialogFooter>
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
