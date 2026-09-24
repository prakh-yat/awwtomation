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
import { RoleBadge, RoleOption } from "./role-badge";

export type TeamMember = {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  /** ISO string: dates are serialised by the server page. */
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

function riseStyle(index: number): React.CSSProperties {
  return { "--i": Math.min(index, 12) } as React.CSSProperties;
}

/** Row removal is destructive, so the icon only turns red under the pointer. */
const REMOVE_BUTTON = "text-muted-foreground hover:bg-destructive/10 hover:text-destructive";

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
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-5">Member</TableHead>
          <TableHead className="w-[142px]">Role</TableHead>
          <TableHead className="hidden w-[132px] sm:table-cell">Joined</TableHead>
          <TableHead className="w-[60px] pr-5">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member, index) => {
          const isSelf = member.userId === currentUserId;
          const busy = busyId === member.userId;
          return (
            <TableRow key={member.userId} className="rise" style={riseStyle(index)}>
              <TableCell className="pl-5">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9">
                    {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
                    <AvatarFallback>{initials(member.name, member.email[0]?.toUpperCase() ?? "?")}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 leading-tight">
                    <div className="flex min-w-0 items-center gap-2 font-semibold">
                      <span className="truncate">{memberName(member)}</span>
                      {isSelf ? (
                        <Badge variant="secondary" className="shrink-0">
                          You
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {canChangeRole(member) ? (
                  <Select value={member.role} onValueChange={(value) => void changeRole(member, value as WorkspaceRole)} disabled={busy}>
                    <SelectTrigger className="h-8 w-[118px] px-3 text-[13px]" aria-label={`Role for ${memberName(member)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          <RoleOption role={role} />
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
              <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                {format(new Date(member.joinedAt), "MMM d, yyyy")}
              </TableCell>
              <TableCell className="pr-5 text-right">
                {canRemove(member) ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" className={REMOVE_BUTTON} aria-label={`Remove ${memberName(member)}`}>
                        <UserMinus />
                      </Button>
                    }
                    title={`Remove ${memberName(member)}?`}
                    description="They lose access to every workspace right away. What they built stays with the team."
                    confirmLabel="Remove"
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
    return <EmptyState icon={Mail} tone="indigo" compact className="border bg-background" title="No pending invitations" action={inviteAction} />;
  }

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-5">Email</TableHead>
          <TableHead className="w-[96px]">Role</TableHead>
          <TableHead className="w-[112px] pr-5 sm:w-[176px]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation, index) => {
          const expiresAt = new Date(invitation.expiresAt);
          return (
            <TableRow key={invitation.id} className="rise" style={riseStyle(index)}>
              <TableCell className="pl-5">
                <p className="truncate font-semibold">{invitation.email}</p>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {invitation.expired ? (
                    <Badge variant="warning" className="shrink-0">
                      Expired
                    </Badge>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="shrink-0 tabular-nums">Expires in {formatDistanceToNowStrict(expiresAt)}</span>
                      </TooltipTrigger>
                      <TooltipContent>{format(expiresAt, "MMM d, yyyy 'at' HH:mm")}</TooltipContent>
                    </Tooltip>
                  )}
                  {invitation.invitedBy ? <span className="truncate">· invited by {invitation.invitedBy}</span> : null}
                </div>
              </TableCell>
              <TableCell>
                <RoleBadge role={invitation.role} />
              </TableCell>
              <TableCell className="pr-5">
                <div className="flex items-center justify-end gap-1">
                  {invitation.inviteUrl && !invitation.expired ? (
                    // Label from sm up; a phone gets the icon, named by aria-label.
                    <CopyButton
                      value={invitation.inviteUrl}
                      label="Copy link"
                      successMessage="Invite link copied"
                      className="[&>span]:hidden sm:[&>span]:inline"
                    />
                  ) : null}
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" className={REMOVE_BUTTON} aria-label={`Revoke invitation for ${invitation.email}`}>
                        <Trash2 />
                      </Button>
                    }
                    title="Revoke this invitation?"
                    description={`The link sent to ${invitation.email} stops working. You can invite them again later.`}
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
