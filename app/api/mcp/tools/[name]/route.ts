import { NextResponse } from "next/server";
import { z } from "zod";

import { findMcpTool } from "@/lib/mcp/tools";
import { setToolAccess } from "@/lib/services/mcp-access";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { name: string };

const bodySchema = z.object({
  /** null opens the tool to every member again; a list narrows it to those members. */
  userIds: z.array(z.string().min(1).max(64)).max(1000).nullable(),
});

/**
 * PUT /api/mcp/tools/[name] { userIds: string[] | null } → { tool, userIds }.
 * Who in the active organization may use one MCP tool. Owners only.
 */
export const PUT = withWorkspace<Params>(
  async (req, ctx, { params }) => {
    const { name } = await params;
    const tool = findMcpTool(name);
    if (!tool) throw new ApiError(404, "No such tool", "NOT_FOUND");
    const { userIds } = await parseBody(req, bodySchema);
    const saved = await setToolAccess({ organizationId: ctx.organization.id, actorId: ctx.user.id, tool: tool.name, userIds });
    return NextResponse.json({ tool: tool.name, userIds: saved });
  },
  { minRole: "OWNER" },
);
