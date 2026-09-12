"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { roleLabel } from "@/lib/workspace/permissions";

import { apiFetch, errorMessage } from "./client-api";

export type TransferCandidate = {
  userId: string;
  name: string | null;
  email: string;
  role: WorkspaceRole;
};

export interface DangerZoneProps {
  workspace: { id: string; name: string };
  role: WorkspaceRole;
  currentUserId: string;
  /** Number of OWNER members — the last owner can neither leave nor be demoted. */
  ownerCount: number;
  /** Members the owner may hand the workspace to (everyone but themselves). Empty for non-owners. */
  transferCandidates: TransferCandidate[];
}

/**
 * After leaving or deleting, the API has already cleared the `or_workspace`
 * cookie; a full navigation (not a soft router push) guarantees the shell
 * re-resolves the next membership or lands on /onboarding.
 */
function hardNavigate(path: string) {
  window.location.assign(path);
}

function displayName(member: TransferCandidate): string {
  return member.name?.trim() || member.email;
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TransferOwnership({ workspace, candidates }: { workspace: { id: string; name: string }; candidates: TransferCandidate[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const target = candidates.find((c) => c.userId === targetId);

  async function handleTransfer() {
    if (!target) return;
    setPending(true);
    try {
      await apiFetch<{ ok: true }>(`/api/workspaces/${workspace.id}/transfer`, {
        method: "POST",
        json: { userId: target.userId },
      });
      toast.success(`${displayName(target)} now owns ${workspace.name}. You are an admin.`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't transfer ownership"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={candidates.length === 0}>
          Transfer ownership
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            The new owner gets full control, including billing and deleting the workspace. You stay on as an admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="transfer-target">New owner</Label>
          <Select value={targetId} onValueChange={setTargetId} disabled={pending}>
            <SelectTrigger id="transfer-target">
              <SelectValue placeholder="Choose a member" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  <span className="flex items-center gap-2">
                    <span>{displayName(member)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {member.name ? `${member.email} · ` : ""}
                      {roleLabel(member.role)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleTransfer} loading={pending} disabled={!target}>
            Transfer to {target ? displayName(target) : "…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkspace({ workspace }: { workspace: { id: string; name: string } }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const matches = typed.trim() === workspace.name;

  async function handleDelete() {
    if (!matches) return;
    setPending(true);
    try {
      await apiFetch<{ ok: true }>(`/api/workspaces/${workspace.id}`, { method: "DELETE" });
      toast.success(`${workspace.name} was deleted`);
      hardNavigate("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the workspace"));
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete workspace
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleDelete();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Delete {workspace.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes every channel, automation, contact, conversation and log in this workspace.
              Connected Instagram and Facebook accounts are released. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-semibold">{workspace.name}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={pending}
              placeholder={workspace.name}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={pending} disabled={!matches}>
              Delete workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveWorkspace({ workspace, userId }: { workspace: { id: string; name: string }; userId: string }) {
  async function handleLeave() {
    try {
      await apiFetch<{ ok: true; left: boolean }>(`/api/workspaces/${workspace.id}/members/${userId}`, {
        method: "DELETE",
      });
      toast.success(`You left ${workspace.name}`);
      hardNavigate("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't leave the workspace"));
      throw err; // keeps the dialog open so the user can retry
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          Leave workspace
        </Button>
      }
      title={`Leave ${workspace.name}?`}
      description="You'll lose access immediately. An admin can invite you back later."
      confirmLabel="Leave workspace"
      destructive
      onConfirm={handleLeave}
    />
  );
}

export function DangerZone({ workspace, role, currentUserId, ownerCount, transferCandidates }: DangerZoneProps) {
  const isOwner = role === "OWNER";
  // The last owner must transfer before leaving; a co-owner may simply leave.
  const canLeave = !isOwner || ownerCount > 1;

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>These actions affect everyone in the workspace and can&apos;t be undone.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {isOwner ? (
          <Row
            title="Transfer ownership"
            description={
              transferCandidates.length === 0
                ? "Invite a teammate first — there's nobody to hand the workspace to yet."
                : "Make another member the owner. You'll remain an admin."
            }
          >
            <TransferOwnership workspace={workspace} candidates={transferCandidates} />
          </Row>
        ) : null}

        <Row
          title="Leave workspace"
          description={
            canLeave
              ? "Remove yourself from this workspace. Your automations and messages stay with the team."
              : "You're the only owner. Transfer ownership before leaving."
          }
        >
          {canLeave ? (
            <LeaveWorkspace workspace={workspace} userId={currentUserId} />
          ) : (
            <Button variant="outline" size="sm" disabled>
              Leave workspace
            </Button>
          )}
        </Row>

        {isOwner ? (
          <Row
            title="Delete workspace"
            description="Permanently delete this workspace and all of its data. Connected accounts are disconnected."
          >
            <DeleteWorkspace workspace={workspace} />
          </Row>
        ) : null}
      </CardContent>
    </Card>
  );
}
