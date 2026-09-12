import { SettingsNav, type SettingsTab } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/page-header";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageBilling, canManageTeam } from "@/lib/workspace/permissions";

/**
 * Shared chrome for /settings/*: the page's single <h1> plus section tabs.
 * Tabs are filtered by role so a MEMBER never sees links to pages that would
 * bounce them back here (the pages guard themselves as well).
 */
export default async function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireWorkspaceContext();

  // Usage is read-only, so every role may see it; the upgrade CTA inside guards itself by role.
  const tabs: SettingsTab[] = [
    { label: "General", href: "/settings", exact: true },
    { label: "Usage", href: "/settings/usage" },
  ];
  if (canManageTeam(ctx.role)) tabs.push({ label: "Team", href: "/settings/team" });
  if (canManageBilling(ctx.role)) tabs.push({ label: "Billing", href: "/settings/billing" });

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Workspace, team and plan settings for ${ctx.workspace.name}.`}
        className="mb-4"
      />
      <SettingsNav tabs={tabs} />
      {children}
    </>
  );
}
