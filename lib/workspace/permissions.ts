import type { WorkspaceRole } from "@prisma/client";

/**
 * Role hierarchy: OWNER > ADMIN > MEMBER.
 * - MEMBER: build automations, use the inbox, manage contacts/links.
 * - ADMIN: everything a member can, plus channels, team, billing, settings.
 * - OWNER: everything, plus deleting the workspace and transferring ownership.
 */
const RANK: Record<WorkspaceRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER"] as const;

export function roleRank(role: WorkspaceRole): number {
  return RANK[role];
}

export function roleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return roleRank(role) >= roleRank(min);
}

export function canManageSettings(role: WorkspaceRole): boolean {
  return roleAtLeast(role, "ADMIN");
}

export function canManageChannels(role: WorkspaceRole): boolean {
  return roleAtLeast(role, "ADMIN");
}

export function canManageTeam(role: WorkspaceRole): boolean {
  return roleAtLeast(role, "ADMIN");
}

export function canManageBilling(role: WorkspaceRole): boolean {
  return roleAtLeast(role, "ADMIN");
}

export function canEditAutomations(role: WorkspaceRole): boolean {
  return roleAtLeast(role, "MEMBER");
}

export function canUseInbox(role: WorkspaceRole): boolean {
  return roleAtLeast(role, "MEMBER");
}

export function canSendBroadcasts(role: WorkspaceRole): boolean {
  return roleAtLeast(role, "MEMBER");
}

export function canDeleteWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

export function canTransferOwnership(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

/** Only owners may hand out or revoke the OWNER role; admins manage the rest. */
export function canAssignRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  if (targetRole === "OWNER") return actorRole === "OWNER";
  return roleAtLeast(actorRole, "ADMIN");
}

export function roleLabel(role: WorkspaceRole): string {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
    case "MEMBER":
      return "Member";
  }
}
