"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Mail, Trash2, UserMinus } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/lib/utils";
import { roleAtLeast, roleLabel, roleRank, WORKSPACE_ROLES } from "@/lib/workspace/permissions";

import { apiFetch, errorMessage } from "./client-api";

export type TeamMember = {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  /** ISO string — dates are serialised by the server page. */
  joinedAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  expired: boolean;
  inviteUrl: string | null;
  invitedBy: string | null;
};

function memberName(member: Pick<TeamMember, "name" | "email">): string {
  return member.name?.trim() || member.email;
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return <Badge variant={role === "OWNER" ? "default" : "outline"}>{roleLabel(role)}</Badge>;
}

// ───────────────────────── Members ─────────────────────────

export interface MembersTableProps {
  organizationId: string;
  members: TeamMember[];
  currentUserId: string;
  actorRole: WorkspaceRole;
}

/**
 * Role changes are OWNER-only in the service layer (`updateMemberRole`), so
 * the Select is only rendered for owners; admins see a badge. Removal follows
 * `removeMember`: ADMIN+ may remove lower roles, owners may remove anyone,
 * and the last owner is untouchable until ownership is transferred.
 */
export function MembersTable({ organizationId, members, currentUserId, actorRole }: MembersTableProps) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const ownerCount = members.filter((m) => m.role === "OWNER").length;

  function isLastOwner(member: TeamMember): boolean {
    return member.role === "OWNER" && ownerCount <= 1;
  }

  function canChangeRole(member: TeamMember): boolean {
    return actorRole === "OWNER" && !isLastOwner(member);
  }

  function canRemove(member: TeamMember): boolean {
    if (member.userId === currentUserId) return false;
    if (!roleAtLeast(actorRole, "ADMIN")) return false;
    if (isLastOwner(member)) return false;
    return actorRole === "OWNER" || roleRank(member.role) < roleRank(actorRole);
  }

  async function changeRole(member: TeamMember, role: WorkspaceRole) {
    if (role === member.role) return;
    setBusyId(member.userId);
    try {
      await apiFetch<{ member: unknown }>(`/api/organizations/${organizationId}/members/${member.userId}`, {
        method: "PATCH",
        json: { role },
      });
      toast.success(`${memberName(member)} is now ${roleLabel(role).toLowerCase()}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't change role"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member: TeamMember) {
    try {
      await apiFetch<{ ok: true }>(`/api/organizations/${organizationId}/members/${member.userId}`, { method: "DELETE" });
      toast.success(`${memberName(member)} was removed from the organization`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove member"));
      throw err; // keep the confirm dialog open for a retry
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Member</TableHead>
          <TableHead className="w-[160px]">Role</TableHead>
          <TableHead className="w-[140px]">Joined</TableHead>
          <TableHead className="w-[64px]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const busy = busyId === member.userId;
          return (
            <TableRow key={member.userId}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar>
                    {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
                    <AvatarFallback>{initials(member.name, member.email[0]?.toUpperCase() ?? "?")}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 leading-tight">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="truncate">{memberName(member)}</span>
                      {isSelf ? <Badge variant="secondary">You</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {canChangeRole(member) ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) => void changeRole(member, value as WorkspaceRole)}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-[13px]" aria-label={`Role for ${memberName(member)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : isLastOwner(member) && actorRole === "OWNER" ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <RoleBadge role={member.role} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Transfer ownership from General settings to change this.</TooltipContent>
                  </Tooltip>
                ) : (
                  <RoleBadge role={member.role} />
                )}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {format(new Date(member.joinedAt), "MMM d, yyyy")}
              </TableCell>
              <TableCell className="text-right">
                {canRemove(member) ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remove ${memberName(member)}`}>
                        <UserMinus />
                      </Button>
                    }
                    title={`Remove ${memberName(member)}?`}
                    description="They lose access to every workspace immediately. Automations and messages they created stay with the team."
                    confirmLabel="Remove member"
                    destructive
                    onConfirm={() => remove(member)}
                  />
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ───────────────────────── Invitations ─────────────────────────

export interface InvitationsTableProps {
  invitations: PendingInvitation[];
  /** Rendered as the empty-state CTA, typically the InviteDialog trigger. */
  inviteAction?: React.ReactNode;
}

export function InvitationsTable({ invitations, inviteAction }: InvitationsTableProps) {
  const router = useRouter();

  async function revoke(invitation: PendingInvitation) {
    try {
      await apiFetch<{ ok: true }>(`/api/invitations/${invitation.id}`, { method: "DELETE" });
      toast.success(`Invitation for ${invitation.email} revoked`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't revoke invitation"));
      throw err;
    }
  }

  if (invitations.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No pending invitations"
        description="Invite teammates to collaborate. Each link is tied to one email address and expires after 7 days."
        action={inviteAction}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Email</TableHead>
          <TableHead className="w-[110px]">Role</TableHead>
          <TableHead className="w-[160px]">Expires</TableHead>
          <TableHead className="w-[200px] text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => {
          const expiresAt = new Date(invitation.expiresAt);
          return (
            <TableRow key={invitation.id}>
              <TableCell>
                <p className="truncate font-medium">{invitation.email}</p>
                {invitation.invitedBy ? (
                  <p className="truncate text-xs text-muted-foreground">Invited by {invitation.invitedBy}</p>
                ) : null}
              </TableCell>
              <TableCell>
                <RoleBadge role={invitation.role} />
              </TableCell>
              <TableCell>
                {invitation.expired ? (
                  <Badge variant="warning">Expired</Badge>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="tabular-nums text-muted-foreground">
                        in {formatDistanceToNowStrict(expiresAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{format(expiresAt, "MMM d, yyyy 'at' HH:mm")}</TooltipContent>
                  </Tooltip>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1.5">
                  {invitation.inviteUrl && !invitation.expired ? (
                    <CopyButton value={invitation.inviteUrl} label="Copy link" successMessage="Invite link copied" />
                  ) : null}
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Revoke invitation for ${invitation.email}`}>
                        <Trash2 />
                      </Button>
                    }
                    title="Revoke this invitation?"
                    description={`The link sent to ${invitation.email} will stop working. You can invite them again later.`}
                    confirmLabel="Revoke"
                    destructive
                    onConfirm={() => revoke(invitation)}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
