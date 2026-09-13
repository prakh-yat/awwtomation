import type { PlanTier, WorkspaceRole } from "@prisma/client";

/** Minimal user shape the shell needs; derived from WorkspaceContext.user. */
export type ShellUser = {
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

/** The active organization: the billable account the workspaces below belong to. */
export type ShellOrganization = {
  id: string;
  name: string;
  /** The plan whose limits apply right now. */
  plan: PlanTier;
};

/** A workspace inside the active organization. */
export type ShellWorkspace = {
  id: string;
  name: string;
};

/** This month's DM allowance for the active organization, shown in the sidebar meter. */
export type ShellUsage = {
  used: number;
  limit: number;
  /** ISO date the count resets. */
  resetsAt: string;
};

export type ShellProps = {
  user: ShellUser;
  organization: ShellOrganization;
  /** How many organizations the user belongs to; "Switch organization" only shows when there is more than one. */
  organizationCount: number;
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string;
  /** The user's role in the active organization. */
  role: WorkspaceRole;
  usage: ShellUsage;
};

const PLAN_LABELS: Record<PlanTier, string> = {
  FREE: "Free",
  STARTER: "Starter",
  PRO: "Pro",
  AGENCY: "Agency",
};

/** Display label for a plan tier. Kept local so the client shell doesn't import billing code. */
export function planLabel(plan: PlanTier): string {
  return PLAN_LABELS[plan] ?? plan;
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function roleLabel(role: WorkspaceRole): string {
  return ROLE_LABELS[role] ?? role;
}
