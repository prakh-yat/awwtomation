"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

import { contactsApi, errorMessage } from "./api";
import { TagInput } from "./tag-input";

export interface BulkTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "remove";
  ids: string[];
  /** Workspace tags (add) or the union of the selection's tags (remove). */
  suggestions: string[];
  /** Called after a successful request so the caller can patch its rows. */
  onApplied: (result: { mode: "add" | "remove"; tags: string[] }) => void;
}

function BulkTagDialog({ open, onOpenChange, mode, ids, suggestions, onApplied }: BulkTagDialogProps) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);

  // Reset the draft each time the dialog opens so a cancelled edit doesn't leak into the next one.
  React.useEffect(() => {
    if (open) setTags([]);
  }, [open]);

  const count = ids.length;
  const noun = `${count} contact${count === 1 ? "" : "s"}`;

  async function apply() {
    if (tags.length === 0) return;
    setPending(true);
    try {
      const result = mode === "add" ? await contactsApi.bulkTags(ids, tags, []) : await contactsApi.bulkTags(ids, [], tags);
      const touched = mode === "add" ? result.added : result.removed;
      toast.success(
        mode === "add"
          ? `Added ${tags.length} tag${tags.length === 1 ? "" : "s"} to ${touched} contact${touched === 1 ? "" : "s"}`
          : `Removed ${tags.length} tag${tags.length === 1 ? "" : "s"} from ${touched} contact${touched === 1 ? "" : "s"}`,
      );
      onApplied({ mode, tags });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update tags"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add tags" : "Remove tags"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? `Tags are appended to ${noun}; existing tags are kept.`
              : `Selected tags are removed from ${noun}. Contacts without them are left untouched.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulk-tags-input">{mode === "add" ? "Tags to add" : "Tags to remove"}</Label>
          <TagInput
            id="bulk-tags-input"
            value={tags}
            onChange={setTags}
            suggestions={suggestions}
            restrictToSuggestions={mode === "remove"}
            placeholder={mode === "add" ? "Type a tag and press Enter" : "Pick tags to remove"}
            autoFocus
          />
          {mode === "remove" && suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">None of the selected contacts have tags.</p>
          ) : null}
        </div>
        <DialogFooter className="mt-2 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={apply} loading={pending} disabled={tags.length === 0}>
            {mode === "add" ? "Add tags" : "Remove tags"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BulkTagDialog };
