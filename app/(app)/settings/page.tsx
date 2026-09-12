import type { Metadata } from "next";

import { DangerZone, type TransferCandidate } from "@/components/settings/danger-zone";
import { GeneralForm } from "@/components/settings/general-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { listMembers } from "@/lib/services/workspaces";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageSettings } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "Settings" };

function IdentityRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <code className="rounded-md border bg-muted px-2 py-1 font-mono text-xs text-foreground">{value}</code>
        <CopyButton value={value} successMessage={`${label} copied`} />
      </div>
    </div>
  );
}

export default async function GeneralSettingsPage() {
  const ctx = await requireWorkspaceContext();
  const { workspace, role, user } = ctx;

  // One query serves both the owner's transfer picker and the last-owner
  // check that decides whether "Leave" is allowed.
  const members = await listMembers(workspace.id);
  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  const transferCandidates: TransferCandidate[] =
    role === "OWNER"
      ? members
          .filter((m) => m.userId !== user.id)
          .map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role }))
      : [];

  return (
    <div className="space-y-6">
      <GeneralForm
        key={`${workspace.name}:${workspace.timezone}`}
        workspace={{ name: workspace.name, timezone: workspace.timezone }}
        canEdit={canManageSettings(role)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Identifiers</CardTitle>
          <CardDescription>Share these when contacting support or requesting a plan change.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <IdentityRow label="Workspace ID" value={workspace.id} hint="Unique and permanent." />
          <IdentityRow label="Slug" value={workspace.slug} hint="Derived from the name when the workspace was created." />
        </CardContent>
      </Card>

      <DangerZone
        workspace={{ id: workspace.id, name: workspace.name }}
        role={role}
        currentUserId={user.id}
        ownerCount={ownerCount}
        transferCandidates={transferCandidates}
      />
    </div>
  );
}
