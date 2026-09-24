import type { Metadata } from "next";

import { ConnectedApps } from "@/components/settings/connected-apps";
import { McpServerCard } from "@/components/settings/mcp-server-card";
import { McpTools, type McpToolGroupItem } from "@/components/settings/mcp-tools";
import { PageHeader } from "@/components/ui/page-header";
import { MCP_TOOL_GROUPS, MCP_TOOLS } from "@/lib/mcp/tools";
import { listConnectedApps, listToolAccess } from "@/lib/services/mcp-access";
import { mcpServerUrl } from "@/lib/services/oauth";
import { listMembers } from "@/lib/services/organizations";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { roleAtLeast } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "MCP" };

/**
 * Settings, MCP: the one URL AI apps connect to, the apps that can reach this
 * organization, and every tool with who may use it. Open to every role: an
 * app acts with the role of whoever connects it, and only the owner decides
 * who gets which tool.
 */
export default async function McpSettingsPage() {
  const ctx = await requireWorkspaceContext();
  const canManageAll = roleAtLeast(ctx.role, "ADMIN");
  const isOwner = ctx.role === "OWNER";

  const [apps, members, access] = await Promise.all([
    listConnectedApps(ctx.organization.id, { userId: ctx.user.id, role: ctx.role }),
    listMembers(ctx.organization.id),
    listToolAccess(ctx.organization.id),
  ]);

  const groups: McpToolGroupItem[] = MCP_TOOL_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    tone: group.tone,
    tools: group.tools.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description, minRole: tool.minRole ?? null })),
  }));

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-10">
        <McpServerCard url={mcpServerUrl()} />

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="brand-label text-muted-foreground">{canManageAll ? "Connected apps" : "Your connected apps"}</h2>
            {apps.length > 0 ? <span className="text-[13px] tabular-nums text-muted-foreground">{apps.length}</span> : null}
          </div>
          <ConnectedApps apps={apps} currentUserId={ctx.user.id} canManageAll={canManageAll} />
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="brand-label text-muted-foreground">Tools</h2>
            <span className="text-[13px] tabular-nums text-muted-foreground">{MCP_TOOLS.length}</span>
            {isOwner ? <p className="text-[13px] text-muted-foreground">Choose who can use each tool. Everyone&apos;s role still applies.</p> : null}
          </div>
          <McpTools
            groups={groups}
            members={members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, avatarUrl: m.user.avatarUrl, role: m.role }))}
            initialAccess={access}
            canManage={isOwner}
            currentUserId={ctx.user.id}
          />
        </section>
      </div>
    </div>
  );
}
