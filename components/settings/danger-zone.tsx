"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  organization: { id: string; name: string };
  workspace: { id: string; name: string };
  /** Workspaces in the organization: its last one can't be deleted on its own. */
  workspaceCount: number;
  role: WorkspaceRole;
  currentUserId: string;
  /** Number of OWNER members: the last owner can neither leave nor be demoted. */
  ownerCount: number;
  /** Members the owner may hand the organization to (everyone but themselves). Empty for non-owners. */
  transferCandidates: TransferCandidate[];
  /** A subscription that will charge again blocks deleting the organization. */
  subscriptionActive: boolean;
}

/** Outline buttons in the zone read red, so nothing in it looks harmless. */
const DANGER_OUTLINE = "text-destructive hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive";

/**
 * After leaving or deleting, the API has already cleared the active cookies; a
 * full navigation (not a soft router push) guarantees the shell re-resolves the
 * next membership or lands on /onboarding.
 */
function hardNavigate(path: string) {
  window.location.assign(path);
}

function displayName(member: TransferCandidate): string {
  return member.name?.trim() || member.email;
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TransferOwnership({ organization, candidates }: { organization: { id: string; name: string }; candidates: TransferCandidate[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const target = candidates.find((c) => c.userId === targetId);

  async function handleTransfer() {
    if (!target) return;
    setPending(true);
    try {
      await apiFetch<{ ok: true }>(`/api/organizations/${organization.id}/transfer`, {
        method: "POST",
        json: { userId: target.userId },
      });
      toast.success(`${displayName(target)} now owns ${organization.name}. You are an admin.`);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            The new owner gets full control of {organization.name}, including billing and deleting it. You stay on as an admin.
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
        <DialogFooter>
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

/** Type-the-name confirmation shared by both deletes. */
function DeleteDialog({
  name,
  triggerLabel,
  description,
  endpoint,
  failure,
}: {
  name: string;
  triggerLabel: string;
  description: string;
  endpoint: string;
  failure: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const matches = typed.trim() === name;

  async function handleDelete() {
    if (!matches) return;
    setPending(true);
    try {
      await apiFetch<{ ok: true }>(endpoint, { method: "DELETE" });
      toast.success(`${name} was deleted`);
      hardNavigate("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err, failure));
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
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleDelete();
          }}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-semibold">{name}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={pending}
              placeholder={name}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={pending} disabled={!matches}>
              {triggerLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveOrganization({ organization, userId }: { organization: { id: string; name: string }; userId: string }) {
  async function handleLeave() {
    try {
      await apiFetch<{ ok: true; left: boolean }>(`/api/organizations/${organization.id}/members/${userId}`, { method: "DELETE" });
      toast.success(`You left ${organization.name}`);
      hardNavigate("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't leave the organization"));
      throw err; // keeps the dialog open so the user can retry
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" className={DANGER_OUTLINE}>
          Leave organization
        </Button>
      }
      title={`Leave ${organization.name}?`}
      description="You lose access to all of its workspaces right away. An admin can invite you back later."
      confirmLabel="Leave organization"
      destructive
      onConfirm={handleLeave}
    />
  );
}

export function DangerZone({
  organization,
  workspace,
  workspaceCount,
  role,
  currentUserId,
  ownerCount,
  transferCandidates,
  subscriptionActive,
}: DangerZoneProps) {
  const isOwner = role === "OWNER";
  // The last owner must transfer before leaving; a co-owner may simply leave.
  const canLeave = !isOwner || ownerCount > 1;
  const onlyWorkspace = workspaceCount <= 1;

  return (
    <section
      aria-labelledby="danger-zone-title"
      className="rise rounded-3xl border border-destructive/30"
      style={{ "--i": 2 } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
        <TriangleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden />
        <h2 id="danger-zone-title" className="brand-label text-destructive">
          Danger zone
        </h2>
      </div>
      <div className="divide-y divide-destructive/15 px-5 pb-1 pt-1 sm:px-6">
        {isOwner ? (
          <Row
            title="Transfer ownership"
            description={
              transferCandidates.length === 0
                ? "Invite a teammate first, then hand the organization to them."
                : "Hand the organization to another member. You stay on as an admin."
            }
          >
            <TransferOwnership organization={organization} candidates={transferCandidates} />
          </Row>
        ) : null}

        <Row
          title="Leave organization"
          description={
            canLeave
              ? `You lose access to every workspace in ${organization.name}. Your work stays with the team.`
              : "You're the only owner. Transfer ownership before leaving."
          }
        >
          {canLeave ? (
            <LeaveOrganization organization={organization} userId={currentUserId} />
          ) : (
            <Button variant="outline" size="sm" className={DANGER_OUTLINE} disabled>
              Leave organization
            </Button>
          )}
        </Row>

        {isOwner ? (
          <Row
            title={`Delete the ${workspace.name} workspace`}
            description={
              onlyWorkspace ? "This is the organization's only workspace. Delete the organization instead." : "Deletes it and all of its data."
            }
          >
            {onlyWorkspace ? (
              <Button variant="destructive" size="sm" disabled>
                Delete workspace
              </Button>
            ) : (
              <DeleteDialog
                name={workspace.name}
                triggerLabel="Delete workspace"
                description="Every account, automation, contact, conversation and log in it is deleted. This can't be undone."
                endpoint={`/api/workspaces/${workspace.id}`}
                failure="Couldn't delete the workspace"
              />
            )}
          </Row>
        ) : null}

        {isOwner ? (
          <Row
            title="Delete organization"
            description={
              subscriptionActive
                ? "Cancel the subscription under Billing first."
                : `Deletes ${organization.name}, ${workspaceCount === 1 ? "its workspace" : `its ${workspaceCount} workspaces`} and its payment history.`
            }
          >
            {subscriptionActive ? (
              <Button variant="destructive" size="sm" disabled>
                Delete organization
              </Button>
            ) : (
              <DeleteDialog
                name={organization.name}
                triggerLabel="Delete organization"
                description="Its workspaces, team and payment history are deleted, with every account, automation, contact and log in them. This can't be undone."
                endpoint={`/api/organizations/${organization.id}`}
                failure="Couldn't delete the organization"
              />
            )}
          </Row>
        ) : null}
      </div>
    </section>
  );
}
