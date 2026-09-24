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
import { TONES, type Tone } from "@/components/ui/tone";
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

/** A workspace's own colour, the same on every visit, so a list of brands reads at a glance. */
const WORKSPACE_TONES: readonly Tone[] = ["purple", "magenta", "green", "orange", "blue", "sky", "lavender", "yellow"];

function workspaceTone(id: string): Tone {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return WORKSPACE_TONES[hash % WORKSPACE_TONES.length];
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
  /** Admins and owners may rename workspaces (and add them, from `NewWorkspaceButton`). */
  canManage: boolean;
  organizationName: string;
  planLabel: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);

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

  return (
    <section className="space-y-3">
      {/* Every workspace shares the organization's plan, so the plan is named once, here. */}
      <p className="brand-label text-muted-foreground">
        {organizationName} · {plural(workspaces.length, "workspace")} · {planLabel} plan
      </p>

      <ul className="space-y-3">
        {workspaces.map((w, index) => {
          const isActive = w.id === activeWorkspaceId;
          const isEditing = editingId === w.id;
          const saving = savingId === w.id;
          // Each number in the colour of the section it counts.
          const stats: Array<{ label: string; value: number; tone: Tone }> = [
            { label: "Accounts", value: w.channels, tone: "yellow" },
            { label: "Automations", value: w.automations, tone: "purple" },
            { label: "Contacts", value: w.contacts, tone: "green" },
          ];
          return (
            <li
              key={w.id}
              className={cn(
                "rise flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6",
                isActive && "border-indigo/40 ring-1 ring-indigo/15",
              )}
              style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span
                  aria-hidden
                  className={cn(
                    "font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]",
                    TONES[workspaceTone(w.id)].solid,
                  )}
                >
                  {w.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
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
                        disabled={saving}
                        className="h-9 w-full max-w-64"
                      />
                      <Button type="submit" size="icon-sm" loading={saving} aria-label="Save name">
                        {saving ? null : <Check />}
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel">
                        <X />
                      </Button>
                    </form>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-[15px] font-semibold">{w.name}</p>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => startEdit(w)}
                          aria-label={`Rename ${w.name}`}
                          className="shrink-0 rounded-full p-1 text-muted-foreground outline-none transition-colors hover:bg-fog hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {isActive ? <Badge variant="yellow">Current</Badge> : null}
                    </div>
                  )}
                  <p className="mt-1 text-[12px] text-muted-foreground">Created {format(new Date(w.createdAt), "MMM d, yyyy")}</p>
                </div>
              </div>

              {/* Cells size to their content, so "Automations" never clips on a phone. */}
              <dl className="flex shrink-0 divide-x rounded-2xl bg-fog lg:w-[380px]">
                {stats.map((s) => (
                  <div key={s.label} className="min-w-0 flex-auto px-3 py-2.5 sm:px-4">
                    <dt className="brand-label flex items-center gap-1.5 truncate text-muted-foreground">
                      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-[3px]", TONES[s.tone].dot)} />
                      {s.label}
                    </dt>
                    <dd className="font-display mt-1 text-[20px] leading-none tabular-nums">{formatNumber(s.value)}</dd>
                  </div>
                ))}
              </dl>

              {isActive ? (
                // Keeps the stats lined up with the rows that have an Open button.
                <div aria-hidden className="hidden shrink-0 lg:block lg:w-24" />
              ) : (
                <div className="flex shrink-0 lg:w-24 lg:justify-end">
                  <Button variant="outline" size="sm" loading={switchingId === w.id} onClick={() => open(w.id)}>
                    Open
                    <ArrowRight />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The header action that creates a workspace and takes you through its setup. */
export function NewWorkspaceButton({ organizationName, planLabel }: { organizationName: string; planLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      toast.error("Use at least 2 characters for the name.");
      return;
    }
    setCreating(true);
    try {
      await send("/api/workspaces", "POST", { name: clean });
      toast.success(`Created ${clean}`);
      setOpen(false);
      router.push("/welcome");
      router.refresh();
    } catch (err) {
      toast.error(clientErrorMessage(err, "Couldn't create the workspace."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setName("");
          setOpen(true);
        }}
      >
        <Plus />
        New workspace
      </Button>

      <Dialog open={open} onOpenChange={(o) => !creating && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={create} className="space-y-5">
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>
                It starts with no accounts connected and shares {organizationName}&apos;s {planLabel} plan and team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="new-workspace-name">Name</Label>
              <Input
                id="new-workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Himalayan Coffee Co."
                maxLength={64}
                autoComplete="off"
                autoFocus
                disabled={creating}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" loading={creating}>
                Create workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
