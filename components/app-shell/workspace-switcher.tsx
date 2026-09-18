"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { ArrowLeftRight, Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientErrorMessage } from "@/lib/errors/customer-messages";
import { cn } from "@/lib/utils";

import { planLabel, type ShellOrganization, type ShellWorkspace } from "./types";

export interface WorkspaceSwitcherProps {
  organization: ShellOrganization;
  /** Workspaces in the active organization. */
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string;
  /** Admins and owners may add workspaces. */
  canCreate: boolean;
  collapsed?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mobile drawer: the panel fills the width instead of sitting beside the rail. */
  variant?: "rail" | "drawer";
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** The dark workspace card under the brand. Opens the switcher panel. */
export function WorkspaceCard({
  organizationName,
  workspace,
  collapsed,
  onOpen,
}: {
  /** Shown small above the workspace name so it's clear which account it belongs to. */
  organizationName: string;
  workspace: ShellWorkspace | undefined;
  collapsed: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={workspace ? `Switch workspace, current: ${workspace.name}` : "Choose a workspace"}
      className={cn(
        "group flex w-full items-center rounded-lg bg-primary text-left text-primary-foreground outline-none transition-colors",
        "hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        collapsed ? "h-10 justify-center px-0" : "gap-3 px-2.5 py-2",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-sm font-semibold ring-1 ring-inset ring-white/10">
        {workspace ? initialOf(workspace.name) : "?"}
      </span>
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] leading-tight text-white/60">{organizationName}</span>
            <span className="block truncate text-sm font-semibold leading-tight">{workspace?.name ?? "No workspace"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/60 transition-colors group-hover:text-white/90" />
        </>
      )}
    </button>
  );
}

/**
 * Panel listing the workspaces in the active organization, anchored beside the
 * rail. Picking one pins it as active (cookie) and lands on its dashboard, since
 * a detail page from the previous workspace would 404. Organizations themselves
 * are switched from the account menu.
 */
export function WorkspaceSwitcher({
  organization,
  workspaces,
  activeWorkspaceId,
  canCreate,
  collapsed = false,
  open,
  onOpenChange,
  variant = "rail",
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setCreating(false);
      setName("");
    }
    onOpenChange(next);
  }

  async function switchTo(id: string) {
    if (id === activeWorkspaceId) {
      onOpenChange(false);
      return;
    }
    setSwitchingId(id);
    try {
      await postJson("/api/workspaces/switch", { workspaceId: id });
      onOpenChange(false);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(clientErrorMessage(err, "Couldn't switch workspace."));
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Use at least 2 characters for the name.");
      return;
    }
    setBusy(true);
    try {
      // Creating a workspace also makes it the active one (the API sets the cookie).
      await postJson<{ workspace: { id: string } }>("/api/workspaces", { name: trimmed });
      toast.success(`Created ${trimmed}`);
      onOpenChange(false);
      router.push("/welcome");
      router.refresh();
    } catch (err) {
      toast.error(clientErrorMessage(err, "Couldn't create the workspace."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-[61] flex max-h-[calc(100vh-2rem)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-background shadow-elevated outline-none ring-1 ring-border",
            "left-4 top-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-2",
            variant === "rail" && (collapsed ? "md:left-[5rem]" : "md:left-[17rem]"),
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-semibold">Workspaces</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                In <span className="font-medium text-foreground">{organization.name}</span>. Each one has its own accounts and contacts, and all of
                them share the {planLabel(organization.plan)} plan.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1 rounded-md p-1 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeWorkspaceId;
              return (
                <li key={ws.id}>
                  <button
                    type="button"
                    onClick={() => switchTo(ws.id)}
                    disabled={switchingId !== null}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                      isActive ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                      {initialOf(ws.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{ws.name}</span>
                    {switchingId === ws.id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : isActive ? (
                      <Check className="h-4 w-4 shrink-0 text-foreground" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <footer className="shrink-0 space-y-1 border-t p-2">
            {creating ? (
              <form onSubmit={handleCreate} className="space-y-2 p-1">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Workspace name"
                  aria-label="Workspace name"
                  autoFocus
                  maxLength={64}
                  disabled={busy}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
                    Create
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : canCreate ? (
              <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New workspace
              </Button>
            ) : null}
            {creating ? null : (
              <Link
                href="/organizations"
                onClick={() => onOpenChange(false)}
                className="flex h-9 items-center justify-center gap-2 rounded-md text-[13px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Switch organization
              </Link>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
