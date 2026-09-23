import type { Metadata } from "next";

import { NewWorkspaceButton, WorkspacesList, type WorkspaceListItem } from "@/components/settings/workspaces-list";
import { PageHeader } from "@/components/ui/page-header";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageSettings } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "Workspaces" };
export const dynamic = "force-dynamic";

export default async function WorkspacesSettingsPage() {
  const ctx = await requireWorkspaceContext();

  // Workspaces in the active organization, with the counts that make one recognisable at a glance.
  const rows = await prisma.workspace.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          channels: { where: { status: { not: "DISCONNECTED" } } },
          automations: true,
          contacts: true,
        },
      },
    },
  });

  const workspaces: WorkspaceListItem[] = rows.map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt.toISOString(),
    channels: w._count.channels,
    automations: w._count.automations,
    contacts: w._count.contacts,
  }));
  const plan = limitsFor(effectivePlan(ctx.organization));
  const canManage = canManageSettings(ctx.role);

  return (
    <div>
      <PageHeader
        title="Settings"
        actions={canManage ? <NewWorkspaceButton organizationName={ctx.organization.name} planLabel={plan.label} /> : null}
      />
      <WorkspacesList
        workspaces={workspaces}
        activeWorkspaceId={ctx.workspace.id}
        canManage={canManage}
        organizationName={ctx.organization.name}
        planLabel={plan.label}
      />
    </div>
  );
}
