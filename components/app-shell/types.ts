import type { PlanTier, WorkspaceRole } from "@prisma/client";

/** Minimal user shape the shell needs; derived from WorkspaceContext.user. */
export type ShellUser = {
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

/** One entry per membership; derived from WorkspaceContext.memberships. */
export type ShellWorkspace = {
  id: string;
  name: string;
  plan: PlanTier;
};

export type ShellProps = {
  user: ShellUser;
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string;
  role: WorkspaceRole;
  isSuperAdmin: boolean;
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
