"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowRight, Check, Pencil, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { clientErrorMessage } from "@/lib/errors/customer-messages";
import { cn, formatNumber } from "@/lib/utils";

export type WorkspaceListItem = {
  id: string;
  name: string;
  createdAt: string;
  channels: number;
  automations: number;
  contacts: number;
};

async function send<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export function WorkspacesList({
  workspaces,
  activeWorkspaceId,
  canManage,
  organizationName,
  planLabel,
}: {
  workspaces: WorkspaceListItem[];
  activeWorkspaceId: string;
  /** Admins and owners may add and rename workspaces. */
  canManage: boolean;
  organizationName: string;
  planLabel: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  function startEdit(w: WorkspaceListItem) {
    setEditingId(w.id);
    setDraft(w.name);
  }

  async function saveRename(id: string) {
    const name = draft.trim();
    if (name.length < 2) {
      toast.error("Use at least 2 characters for the name.");
      return;
    }
    setSavingId(id);
    try {
      await send(`/api/workspaces/${id}`, "PATCH", { name });
      toast.success("Workspace renamed");
      setEditingId(null);
      router.refresh();
    } catch (err) {
      toast.error(clientErrorMessage(err, "Couldn't rename the workspace."));
    } finally {
      setSavingId(null);
    }
  }

  async function open(id: string) {
    setSwitchingId(id);
    try {
      await send("/api/workspaces/switch", "POST", { workspaceId: id });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(clientErrorMessage(err, "Couldn't open that workspace."));
      setSwitchingId(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      toast.error("Use at least 2 characters for the name.");
      return;
    }
    setCreating(true);
    try {
      await send("/api/workspaces", "POST", { name });
      toast.success(`Created ${name}`);
      setCreateOpen(false);
      router.push("/channels?onboarding=1");
      router.refresh();
    } catch (err) {
      toast.error(clientErrorMessage(err, "Couldn't create the workspace."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {plural(workspaces.length, "workspace")}
        </p>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => {
              setNewName("");
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New workspace
          </Button>
        ) : null}
      </div>

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {workspaces.map((w) => {
          const isActive = w.id === activeWorkspaceId;
          const isEditing = editingId === w.id;
          const canRename = canManage;
          return (
            <li
              key={w.id}
              className={cn(
                "flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between",
                isActive && "ring-1 ring-foreground/10",
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                  {w.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 space-y-1">
                  {isEditing ? (
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename(w.id);
                      }}
                    >
                      <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                        aria-label="Workspace name"
                        maxLength={64}
                        autoFocus
                        disabled={savingId === w.id}
                        className="h-8 w-56"
                      />
                      <Button type="submit" size="icon" className="h-8 w-8" loading={savingId === w.id} aria-label="Save name">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)} aria-label="Cancel">
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      {canRename ? (
                        <button
                          type="button"
                          onClick={() => startEdit(w)}
                          aria-label={`Rename ${w.name}`}
                          className="rounded p-0.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {isActive ? <Badge variant="secondary">Current</Badge> : null}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {plural(w.channels, "account")} · {plural(w.automations, "automation")} · {plural(w.contacts, "contact")}
                  </p>
                  <p className="text-xs text-muted-foreground">Created {format(new Date(w.createdAt), "MMM d, yyyy")}</p>
                </div>
              </div>

              {isActive ? null : (
                <Button variant="outline" size="sm" className="self-start sm:self-center" loading={switchingId === w.id} onClick={() => open(w.id)}>
                  Open
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Everyone on the {organizationName} team can open every workspace, and all of them share the {planLabel} plan&apos;s limits.
      </p>

      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent className="max-w-md">
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>
                Starts with no accounts connected. It shares {organizationName}&apos;s {planLabel} plan and team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="new-workspace-name">Name</Label>
              <Input
                id="new-workspace-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Himalayan Coffee Co."
                maxLength={64}
                autoComplete="off"
                autoFocus
                disabled={creating}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" loading={creating}>
                Create workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
