import type { WorkspaceRole } from "@prisma/client";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/workspace/permissions";

/** One colour per role, so a list of people reads at a glance. */
const ROLE_TONE: Record<WorkspaceRole, { badge: BadgeVariant; dot: string }> = {
  OWNER: { badge: "indigo", dot: "bg-indigo" },
  ADMIN: { badge: "lavender", dot: "bg-lavender" },
  MEMBER: { badge: "secondary", dot: "bg-mute" },
};

export function RoleBadge({ role, className }: { role: WorkspaceRole; className?: string }) {
  return (
    <Badge variant={ROLE_TONE[role].badge} className={className}>
      {roleLabel(role)}
    </Badge>
  );
}

/** The role's name after its colour dot, for select options. */
export function RoleOption({ role }: { role: WorkspaceRole }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", ROLE_TONE[role].dot)} />
      {roleLabel(role)}
    </span>
  );
}
