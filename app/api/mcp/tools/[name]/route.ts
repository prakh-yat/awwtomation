import { NextResponse } from "next/server";
import { z } from "zod";

import { isReadOnlyTool } from "@/lib/mcp/tool";
import { findMcpTool } from "@/lib/mcp/tools";
import { setToolAccess } from "@/lib/services/mcp-access";
import { ApiError, parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { name: string };

const bodySchema = z.object({
  /** Every member, including people who join later. */
  everyone: z.boolean(),
  /** Used when `everyone` is false: exactly these members. */
  userIds: z.array(z.string().min(1).max(64)).max(1000).default([]),
});

/**
 * PUT /api/mcp/tools/[name] { everyone, userIds } → { tool, access }.
 * Who in the active organization may use one MCP tool. Owners only. `access`
 * is null when the tool is back at its default.
 */
export const PUT = withWorkspace<Params>(
  async (req, ctx, { params }) => {
    const { name } = await params;
    const tool = findMcpTool(name);
    if (!tool) throw new ApiError(404, "No such tool", "NOT_FOUND");
    const { everyone, userIds } = await parseBody(req, bodySchema);
    const access = await setToolAccess({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      tool: tool.name,
      readOnly: isReadOnlyTool(tool),
      everyone,
      userIds,
    });
    return NextResponse.json({ tool: tool.name, access });
  },
  { minRole: "OWNER" },
);
