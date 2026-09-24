/**
 * How an MCP tool is declared and run.
 *
 * A tool is the MCP twin of an API route: a zod input, a role it needs, and a
 * body that calls the same `lib/services/*` function the route calls. It runs
 * as the person who approved the app, in a workspace that person let the app
 * reach, with the role they hold there right now. So an app can never do more
 * than the person could do in the app themselves.
 *
 * Workspace tools get a `workspaceId` argument added for them. It may be left
 * out when the app can reach exactly one workspace.
 */
import type { User, WorkspaceRole } from "@prisma/client";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z, ZodError, type ZodRawShape } from "zod";

import { ActivationBlockedError } from "@/lib/services/automations";
import type { ReachableWorkspace, ToolAccessMap } from "@/lib/services/mcp-access";
import { ApiError, handleApiError } from "@/lib/workspace/api";
import type { WorkspaceContext } from "@/lib/workspace/context";
import { roleLabel, roleRank } from "@/lib/workspace/permissions";

/** Who is calling: the person, the app they approved, where that app may act, and which tools each organization's owner has narrowed. */
export type McpPrincipal = {
  user: User;
  clientId: string;
  clientName: string;
  reachable: ReachableWorkspace[];
  toolAccess: ToolAccessMap;
};

type ToolBase = {
  name: string;
  title: string;
  description: string;
  annotations?: ToolAnnotations;
};

export type McpTool = ToolBase & {
  /** Workspace tools act in one workspace; account tools (list_workspaces, the guide) do not. */
  scope: "workspace" | "account";
  /** The role the matching API route requires. Omitted means any member. */
  minRole?: WorkspaceRole;
  /** The full input shape, `workspaceId` included for workspace tools. */
  input: ZodRawShape;
  run: (args: Record<string, unknown>, principal: McpPrincipal) => Promise<unknown>;
};

const WORKSPACE_ID = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe("Workspace id from list_workspaces. Optional when there is only one.");

/** Replies longer than this are cut, with a note on how to ask for less. */
const MAX_RESULT_CHARS = 120_000;

export function workspaceTool<S extends ZodRawShape>(
  def: ToolBase & {
    input: S;
    /** The role the matching API route requires. Omitted means any member. */
    minRole?: WorkspaceRole;
    run: (args: z.infer<z.ZodObject<S>>, ctx: WorkspaceContext, principal: McpPrincipal) => Promise<unknown>;
  },
): McpTool {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    annotations: def.annotations,
    scope: "workspace",
    minRole: def.minRole,
    input: { workspaceId: WORKSPACE_ID, ...def.input },
    run: async (args, principal) => {
      const { workspaceId, ...rest } = args as { workspaceId?: string } & Record<string, unknown>;
      const ctx = workspaceContextFor(principal, workspaceId);
      if (def.minRole && roleRank(ctx.role) < roleRank(def.minRole)) {
        throw new ApiError(
          403,
          `This needs the ${roleLabel(def.minRole).toLowerCase()} role. ${principal.user.name ?? principal.user.email}'s role in ${ctx.workspace.name} is ${roleLabel(ctx.role).toLowerCase()}.`,
          "FORBIDDEN",
        );
      }
      if (!canUseTool(principal, ctx.organization.id, def.name)) {
        throw new ApiError(403, `The owner of ${ctx.organization.name} has turned off ${def.name} for you.`, "TOOL_OFF");
      }
      return def.run(rest as z.infer<z.ZodObject<S>>, ctx, principal);
    },
  };
}

/** A tool that is not about one workspace (listing them, reading the guide). */
export function accountTool<S extends ZodRawShape>(
  def: ToolBase & { input: S; run: (args: z.infer<z.ZodObject<S>>, principal: McpPrincipal) => Promise<unknown> },
): McpTool {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    annotations: def.annotations,
    scope: "account",
    input: def.input,
    run: async (args, principal) => {
      const organizations = new Set(principal.reachable.map((r) => r.organization.id));
      if (organizations.size > 0 && ![...organizations].some((id) => canUseTool(principal, id, def.name))) {
        throw new ApiError(403, `The owner of your organization has turned off ${def.name} for you.`, "TOOL_OFF");
      }
      return def.run(args as z.infer<z.ZodObject<S>>, principal);
    },
  };
}

/** False when the organization's owner narrowed this tool to a list that leaves the caller out. */
export function canUseTool(principal: McpPrincipal, organizationId: string, tool: string): boolean {
  const allowed = principal.toolAccess.get(organizationId)?.get(tool);
  return !allowed || allowed.has(principal.user.id);
}

/**
 * Whether a tool belongs in this caller's tool list: some workspace they can
 * reach gives them the role it needs and the owner has not turned it off for
 * them. With no workspace at all, only list_workspaces and the guide remain,
 * and list_workspaces says what to do.
 */
export function isToolVisible(tool: McpTool, principal: McpPrincipal): boolean {
  if (principal.reachable.length === 0) return tool.scope === "account";
  return principal.reachable.some(
    (r) => roleRank(r.role) >= roleRank(tool.minRole ?? "MEMBER") && canUseTool(principal, r.organization.id, tool.name),
  );
}

/** The same context object `withWorkspace` hands a route, built from the grant instead of cookies. */
export function workspaceContextFor(principal: McpPrincipal, workspaceId: string | undefined): WorkspaceContext {
  const { reachable } = principal;
  if (reachable.length === 0) {
    throw new ApiError(
      403,
      "This app can't reach any workspace. Disconnect it in Awwtomation (Settings, MCP) and connect it again, then pick a workspace.",
      "NO_WORKSPACE",
    );
  }

  let target: ReachableWorkspace | undefined;
  if (workspaceId) {
    target = reachable.find((r) => r.workspace.id === workspaceId);
    if (!target) throw new ApiError(404, "Unknown workspace, or this app was not given access to it. Call list_workspaces for the ones it can use.", "WORKSPACE_NOT_FOUND");
  } else if (reachable.length === 1) {
    target = reachable[0];
  } else {
    const names = reachable.map((r) => `${r.workspace.name} (${r.workspace.id})`).join(", ");
    throw new ApiError(400, `Pass workspaceId. This app can reach ${reachable.length} workspaces: ${names}.`, "WORKSPACE_REQUIRED");
  }

  const organizations = new Map<string, WorkspaceContext["organizations"][number]>();
  for (const r of reachable) {
    if (!organizations.has(r.organization.id)) {
      organizations.set(r.organization.id, {
        organization: { id: r.organization.id, name: r.organization.name, slug: r.organization.slug, plan: r.organization.plan },
        role: r.role,
      });
    }
  }

  return {
    user: principal.user,
    organization: target.organization,
    workspace: target.workspace,
    role: target.role,
    workspaces: target.organizationWorkspaces,
    organizations: Array.from(organizations.values()),
  };
}

/**
 * Drops keys whose value is undefined. Tool arguments arrive with every
 * optional key the model left out missing, but spreading them into a service
 * input would turn "not given" into "given as undefined", which a strict or
 * "nothing to update" schema reads differently.
 */
export function compact<T extends Record<string, unknown>>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

// ───────────────────────── Results ─────────────────────────

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? { ok: true }, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

function clamp(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_RESULT_CHARS)}\n\n[Cut off: the full result was ${text.length.toLocaleString("en")} characters. Ask for less with filters, a smaller limit or a page.]`;
}

export function toolResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: clamp(stringify(value)) }] };
}

/**
 * Errors read the way the app's own toasts do: expected failures (not found,
 * plan limit, Meta refusing a send) keep their sentence and code; anything
 * unexpected is logged with a reference and reported without internals.
 * Validation errors name the field, because the caller is a model that can
 * fix its own input.
 */
export async function toolError(err: unknown): Promise<CallToolResult> {
  let text: string;
  if (err instanceof ActivationBlockedError) {
    text = `Can't turn this automation on yet. Fix these first:\n${err.errors.map((e) => `- ${e}`).join("\n")}`;
  } else if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `- ${i.path.length ? i.path.join(".") : "input"}: ${i.message}`);
    text = `Invalid input:\n${issues.join("\n")}`;
  } else {
    const res = handleApiError(err);
    const body = (await res.json()) as { error?: string; code?: string; reference?: string };
    text = body.error ?? "Something went wrong.";
    if (body.code) text += ` (${body.code})`;
    if (body.reference) text += ` Reference: ${body.reference}.`;
  }
  return { isError: true, content: [{ type: "text", text }] };
}
