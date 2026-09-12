"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
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
import { canAssignRole, roleLabel } from "@/lib/workspace/permissions";

import { apiFetch, errorMessage, isPlanLimitError } from "./client-api";

export interface InviteDialogProps {
  actorRole: WorkspaceRole;
  /** Seats = members + live invitations, straight from `getUsage().members`. */
  seats: { used: number; limit: number };
  /** Custom trigger; defaults to a primary "Invite member" button. */
  trigger?: React.ReactNode;
}

type InviteResponse = {
  invitation: { id: string; email: string; role: WorkspaceRole; expiresAt: string };
  inviteUrl: string;
};

const ROLE_HINTS: Record<WorkspaceRole, string> = {
  MEMBER: "Builds automations, uses the inbox and manages contacts.",
  ADMIN: "Everything a member can, plus channels, team and billing.",
  OWNER: "Full control, including deleting the workspace.",
};

/**
 * Two-step dialog: collect email + role, then show the generated link.
 * We never send email ourselves, so the second step is the whole point —
 * the admin copies the link and shares it however they like.
 */
export function InviteDialog({ actorRole, seats, trigger }: InviteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<WorkspaceRole>("MEMBER");
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState<InviteResponse | null>(null);

  const seatsFull = seats.used >= seats.limit;
  const roles = (["MEMBER", "ADMIN", "OWNER"] as const).filter((r) => canAssignRole(actorRole, r));

  function toastPlanLimit(message?: string) {
    toast.error(message ?? `Your plan allows ${seats.limit} team ${seats.limit === 1 ? "member" : "members"}.`, {
      description: "Upgrade to invite more people.",
      action: { label: "View plans", onClick: () => router.push("/settings/billing") },
    });
  }

  function reset() {
    setEmail("");
    setRole("MEMBER");
    setCreated(null);
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    // Short-circuit when there is no seat to give: the server would reject
    // it anyway, and a toast with an upgrade path beats a form that fails.
    if (next && seatsFull) {
      toastPlanLimit();
      return;
    }
    setOpen(next);
    if (!next) reset();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) {
      toast.error("Enter an email address");
      return;
    }
    setPending(true);
    try {
      const result = await apiFetch<InviteResponse>("/api/invitations", { method: "POST", json: { email: clean, role } });
      setCreated(result);
      toast.success(`Invite link created for ${result.invitation.email}`);
      router.refresh();
    } catch (err) {
      if (isPlanLimitError(err)) toastPlanLimit(errorMessage(err, "Team member limit reached"));
      else toast.error(errorMessage(err, "Couldn't create the invitation"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <UserPlus />
            Invite member
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {created ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Share the invite link</DialogTitle>
              <DialogDescription>
                No email is sent. Copy this link and share it with {created.invitation.email} — it only works for that
                address and expires in 7 days.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="invite-url">Invite link</Label>
              <div className="flex items-center gap-2">
                <Input id="invite-url" readOnly value={created.inviteUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <CopyButton value={created.inviteUrl} label="Copy" successMessage="Invite link copied" className="shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">
                They&apos;ll join as {roleLabel(created.invitation.role).toLowerCase()}. You can change that from the members
                list once they accept.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={reset}>
                Invite another
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                You&apos;ll get a link to share. {seats.used} of {seats.limit} seats are in use.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoFocus
                autoComplete="off"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
                required
              />
              <p className="text-xs text-muted-foreground">They must sign in with Google using this exact address.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)} disabled={pending}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Create invite link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
