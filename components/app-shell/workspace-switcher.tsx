"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, initials } from "@/lib/utils";

import { planLabel, type ShellWorkspace } from "./types";

export interface WorkspaceSwitcherProps {
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string;
  collapsed?: boolean;
  className?: string;
}

type ApiError = { error?: string };
type CreatedWorkspace = { id?: string; workspace?: { id?: string } };

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ApiError;
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function WorkspaceMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function WorkspaceSwitcher({ workspaces, activeWorkspaceId, collapsed = false, className }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  async function switchTo(workspaceId: string, label?: string) {
    if (workspaceId === activeWorkspaceId) return;
    const res = await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (!res.ok) {
      toast.error(await readError(res, "Couldn't switch workspace"));
      return;
    }
    if (label) toast.success(`Switched to ${label}`);
    // Detail pages (e.g. /automations/[id]) belong to the old workspace, so land
    // on the dashboard rather than refreshing into a 404.
    startTransition(() => {
      router.push("/dashboard");
      router.refresh();
    });
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      toast.error("Workspace name must be at least 2 characters");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Couldn't create workspace"));
        return;
      }
      const data = (await res.json()) as CreatedWorkspace;
      const id = data.id ?? data.workspace?.id;
      if (!id) {
        toast.error("Workspace created but no id was returned");
        return;
      }
      setCreateOpen(false);
      setNewName("");
      await switchTo(id, name);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setCreating(false);
    }
  }

  if (!active) return null;

  const trigger = (
    <button
      type="button"
      disabled={pending}
      className={cn(
        "flex w-full items-center gap-2 rounded-md text-left text-[13px] outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        collapsed ? "h-9 justify-center px-0" : "h-9 px-2",
        className,
      )}
      aria-label={collapsed ? `Workspace: ${active.name}` : undefined}
    >
      <WorkspaceMark name={active.name} />
      {collapsed ? null : (
        <>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-medium text-foreground">{active.name}</span>
            <span className="truncate text-[11px] text-muted-foreground">{planLabel(active.plan)} plan</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </>
      )}
    </button>
  );

  return (
    <>
      <DropdownMenu>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{active.name}</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-60">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} onSelect={() => void switchTo(ws.id, ws.name)} className="gap-2.5">
              <WorkspaceMark name={ws.name} className="h-5 w-5 text-[10px]" />
              <span className="min-w-0 flex-1 truncate">{ws.name}</span>
              <span className="text-[11px] text-muted-foreground">{planLabel(ws.plan)}</span>
              {ws.id === activeWorkspaceId ? <Check className="!text-foreground" /> : <span className="w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create a workspace</DialogTitle>
              <DialogDescription>
                Workspaces keep channels, automations and contacts separate — one per brand or client.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                autoFocus
                autoComplete="off"
                placeholder="Acme Studio"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={64}
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
    </>
  );
}

export { WorkspaceSwitcher };
