import type { Metadata } from "next";

import { DangerZone, type TransferCandidate } from "@/components/settings/danger-zone";
import { GeneralForm } from "@/components/settings/general-form";
import { OrganizationForm } from "@/components/settings/organization-form";
import { PageHeader } from "@/components/ui/page-header";
import { effectivePlan } from "@/lib/billing/entitlements";
import { listMembers } from "@/lib/services/organizations";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageSettings } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "General settings" };

const CHARGING_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE", "ON_HOLD"]);

export default async function GeneralSettingsPage() {
  const ctx = await requireWorkspaceContext();
  const { organization, workspace, role, user } = ctx;

  // One query serves the owner's transfer picker, the member count and the
  // last-owner check that decides whether "Leave" is allowed.
  const members = await listMembers(organization.id);
  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  const transferCandidates: TransferCandidate[] =
    role === "OWNER"
      ? members.filter((m) => m.userId !== user.id).map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role }))
      : [];
  const subscriptionActive =
    organization.billingSubscriptionId !== null && CHARGING_STATUSES.has(organization.billingStatus) && !organization.cancelAtPeriodEnd;

  return (
    <div>
      <PageHeader title="General" description={`The ${workspace.name} workspace and the ${organization.name} organization it belongs to.`} />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <GeneralForm
            key={`${workspace.name}:${workspace.timezone}`}
            workspace={{ name: workspace.name, timezone: workspace.timezone }}
            canEdit={canManageSettings(role)}
          />
          <OrganizationForm
            key={organization.name}
            organization={{ id: organization.id, name: organization.name, plan: effectivePlan(organization) }}
            workspaceCount={ctx.workspaces.length}
            memberCount={members.length}
            canEdit={canManageSettings(role)}
          />
        </div>

        <DangerZone
          organization={{ id: organization.id, name: organization.name }}
          workspace={{ id: workspace.id, name: workspace.name }}
          workspaceCount={ctx.workspaces.length}
          role={role}
          currentUserId={user.id}
          ownerCount={ownerCount}
          transferCandidates={transferCandidates}
          subscriptionActive={subscriptionActive}
        />
      </div>
    </div>
  );
}
