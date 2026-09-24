import type { Tone } from "@/components/ui/tone";

import type { McpTool } from "../tool";

import { aiTools } from "./ai";
import { accountTools, automationTools } from "./automations";
import { broadcastTools, linkTools } from "./broadcasts";
import { contactTools } from "./contacts";
import { crmTools } from "./crm";
import { inboxTools } from "./inbox";
import { reportTools } from "./reports";
import { workspaceTools } from "./workspaces";

export type McpToolGroup = {
  id: string;
  label: string;
  /** The tone of the section these tools mirror, as in the dock. */
  tone: Tone;
  tools: readonly McpTool[];
};

/**
 * Every tool the MCP server offers, grouped by the part of the app it
 * mirrors, in the order the navigation runs. Settings, MCP lists them this way.
 */
export const MCP_TOOL_GROUPS: readonly McpToolGroup[] = [
  { id: "workspace", label: "Workspace and team", tone: "indigo", tools: workspaceTools },
  { id: "accounts", label: "Accounts", tone: "yellow", tools: accountTools },
  { id: "automations", label: "Automations", tone: "purple", tools: automationTools },
  { id: "ai", label: "AI", tone: "ink", tools: aiTools },
  { id: "inbox", label: "Inbox", tone: "magenta", tools: inboxTools },
  { id: "contacts", label: "Contacts", tone: "green", tools: contactTools },
  { id: "crm", label: "Pipelines and segments", tone: "green", tools: crmTools },
  { id: "broadcasts", label: "Broadcasts", tone: "orange", tools: broadcastTools },
  { id: "links", label: "Links", tone: "sky", tools: linkTools },
  { id: "reports", label: "Analytics, logs and billing", tone: "blue", tools: reportTools },
];

export const MCP_TOOLS: readonly McpTool[] = MCP_TOOL_GROUPS.flatMap((group) => group.tools);

const seen = new Set<string>();
for (const tool of MCP_TOOLS) {
  if (seen.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
  seen.add(tool.name);
}

export function findMcpTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}
