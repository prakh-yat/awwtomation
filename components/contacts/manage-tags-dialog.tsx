"use client";

import * as React from "react";
import { Check, Pencil, Tags, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import type { ContactTagCount } from "@/lib/services/contacts";

import { contactsApi, errorMessage } from "./api";

export interface ManageTagsDialogProps {
  /** Initial list (server-rendered); refetched every time the dialog opens. */
  tags: ContactTagCount[];
  /** Fired after a rename/delete so the list page can refresh rows and counts. */
  onChanged?: () => void;
}

function TagRow({ row, onRenamed, onDeleted }: { row: ContactTagCount; onRenamed: (to: string) => Promise<void>; onDeleted: () => Promise<void> }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(row.tag);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const to = draft.trim();
    if (!to || to === row.tag) {
      setEditing(false);
      setDraft(row.tag);
      return;
    }
    setSaving(true);
    try {
      await onRenamed(to);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      {editing ? (
        <>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(row.tag);
              }
            }}
            maxLength={64}
            autoFocus
            className="h-8 flex-1 text-[13px]"
            aria-label={`Rename ${row.tag}`}
          />
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={save} loading={saving} aria-label="Save">
            {saving ? null : <Check />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setDraft(row.tag);
            }}
            aria-label="Cancel"
          >
            <X />
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-[13px] font-medium">{row.tag}</span>
          <span className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">
            {row.count} {row.count === 1 ? "contact" : "contacts"}
          </span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)} aria-label={`Rename ${row.tag}`}>
            <Pencil />
          </Button>
          <ConfirmDialog
            trigger={
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Delete ${row.tag}`}>
                <Trash2 />
              </Button>
            }
            title={`Delete “${row.tag}”?`}
            description={`The tag is removed from ${row.count} contact${row.count === 1 ? "" : "s"}. Automations that add it will recreate it the next time they run.`}
            confirmLabel="Delete tag"
            destructive
            onConfirm={onDeleted}
          />
        </>
      )}
    </li>
  );
}

/**
 * Rename or delete tags across the whole workspace. Tags have no row of their
 * own — they only exist on contacts — so this is the one place to tidy them.
 */
function ManageTagsDialog({ tags: initialTags, onChanged }: ManageTagsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [tags, setTags] = React.useState(initialTags);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setTags(await contactsApi.tags());
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load tags"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function rename(from: string, to: string) {
    try {
      const { updated } = await contactsApi.renameTag(from, to);
      toast.success(`Renamed “${from}” to “${to}” on ${updated} contact${updated === 1 ? "" : "s"}`);
      await refresh();
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't rename tag"));
      throw err;
    }
  }

  async function remove(tag: string) {
    try {
      const { updated } = await contactsApi.deleteTag(tag);
      toast.success(`Removed “${tag}” from ${updated} contact${updated === 1 ? "" : "s"}`);
      await refresh();
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete tag"));
      throw err;
    }
  }

  const q = query.trim().toLowerCase();
  const visible = q ? tags.filter((t) => t.tag.toLowerCase().includes(q)) : tags;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tags />
          Manage tags
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage tags</DialogTitle>
          <DialogDescription>Rename or delete tags across every contact in this workspace.</DialogDescription>
        </DialogHeader>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a tag…" className="h-8 text-[13px]" />
        <div className="relative max-h-80 overflow-auto rounded-md border">
          {loading && tags.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Spinner size="sm" />
            </div>
          ) : visible.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              {tags.length === 0 ? "No tags yet. Add one from a contact or a flow's Tag step." : "No matching tags."}
            </p>
          ) : (
            <ul className="divide-y">
              {visible.map((row) => (
                <TagRow key={row.tag} row={row} onRenamed={(to) => rename(row.tag, to)} onDeleted={() => remove(row.tag)} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ManageTagsDialog };
