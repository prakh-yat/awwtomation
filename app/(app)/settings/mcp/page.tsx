import type { Metadata } from "next";

import { McpServerCard } from "@/components/settings/mcp-server-card";
import { McpTools, type McpToolGroupItem, type ToolKind } from "@/components/settings/mcp-tools";
import { PageHeader } from "@/components/ui/page-header";
import { isReadOnlyTool, type McpTool } from "@/lib/mcp/tool";
import { MCP_TOOL_GROUPS } from "@/lib/mcp/tools";
import { listToolAccess } from "@/lib/services/mcp-access";
import { mcpServerUrl } from "@/lib/services/oauth";
import { listMembers } from "@/lib/services/organizations";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "MCP" };

function kindOf(tool: McpTool): ToolKind {
  if (isReadOnlyTool(tool)) return "read";
  return tool.annotations?.destructiveHint ? "destructive" : "write";
}

/**
 * Settings, MCP: the one URL AI apps connect to, and every tool with who may
 * use it. Open to every role; only the owner changes who gets which tool.
 */
export default async function McpSettingsPage() {
  const ctx = await requireWorkspaceContext();
  const [members, access] = await Promise.all([listMembers(ctx.organization.id), listToolAccess(ctx.organization.id)]);

  const groups: McpToolGroupItem[] = MCP_TOOL_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    tone: group.tone,
    tools: group.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      minRole: tool.minRole ?? null,
      kind: kindOf(tool),
    })),
  }));

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-8">
        <McpServerCard url={mcpServerUrl()} />
        <McpTools
          groups={groups}
          members={members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, avatarUrl: m.user.avatarUrl, role: m.role }))}
          initialAccess={access}
          canManage={ctx.role === "OWNER"}
          currentUserId={ctx.user.id}
        />
      </div>
    </div>
  );
}
