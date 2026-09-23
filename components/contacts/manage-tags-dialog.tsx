"use client";

import * as React from "react";
import { Check, Pencil, Search, Tags, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { ContactTagCount } from "@/lib/services/contacts";

import { contactsApi, errorMessage } from "./api";
import { riseStyle } from "./rise";

export interface ManageTagsDialogProps {
  /** Initial list (server-rendered); refetched every time the dialog opens. */
  tags: ContactTagCount[];
  /** Fired after a rename/delete so the list page can refresh rows and counts. */
  onChanged?: () => void;
  /** Controlled open state, for opening from a menu. Without it the dialog renders its own button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function TagRow({ row, index, onRenamed, onDeleted }: { row: ContactTagCount; index: number; onRenamed: (to: string) => Promise<void>; onDeleted: () => Promise<void> }) {
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
    <li className="rise flex min-h-[52px] items-center gap-2 px-3 py-2" style={riseStyle(index)}>
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
            className="h-9 flex-1 text-[13px]"
            aria-label={`Rename ${row.tag}`}
          />
          <Button type="button" size="icon-sm" onClick={save} loading={saving} aria-label="Save">
            {saving ? null : <Check />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
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
          <span className="min-w-0 flex-1">
            <Badge variant="green" className="max-w-full text-[12px]">
              <span className="min-w-0 truncate">{row.tag}</span>
            </Badge>
          </span>
          <span className="shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
            {row.count} {row.count === 1 ? "contact" : "contacts"}
          </span>
          <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-ink" onClick={() => setEditing(true)} aria-label={`Rename ${row.tag}`}>
            <Pencil />
          </Button>
          <ConfirmDialog
            trigger={
              <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${row.tag}`}>
                <Trash2 />
              </Button>
            }
            title={`Delete “${row.tag}”?`}
            description={`It comes off ${row.count} contact${row.count === 1 ? "" : "s"}. Automations that add it will add it again.`}
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
 * own, they only exist on contacts, so this is the one place to tidy them.
 */
function ManageTagsDialog({ tags: initialTags, onChanged, open: controlledOpen, onOpenChange }: ManageTagsDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setUncontrolledOpen(next));
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
      {controlled ? null : (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Tags />
            Manage tags
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage tags</DialogTitle>
          <DialogDescription>Changes apply to every contact.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a tag…" aria-label="Find a tag" className="h-9 rounded-full pl-9 text-[13px]" />
        </div>
        <div className="relative max-h-80 overflow-auto rounded-2xl border">
          {loading && tags.length === 0 ? (
            <ul className="divide-y" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-3.5">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="ml-auto h-3 w-16" />
                </li>
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">{tags.length === 0 ? "No tags yet" : "No matching tags"}</p>
          ) : (
            <ul className="divide-y">
              {visible.map((row, i) => (
                <TagRow key={row.tag} row={row} index={i} onRenamed={(to) => rename(row.tag, to)} onDeleted={() => remove(row.tag)} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ManageTagsDialog };
