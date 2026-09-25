/**
 * The MCP endpoint: POST /mcp, one URL for every customer.
 *
 * Each request stands alone (stateless streamable HTTP, JSON responses): the
 * bearer token names the person and the app, their grants are resolved
 * against their memberships right now, and a server is built with every tool
 * bound to that principal. Nothing survives the request, so a disconnect or a
 * role change applies to the very next call, and any number of app instances
 * can serve it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { brand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { corsHeaders } from "@/lib/oauth/http";
import { checkRateLimit, clientIp, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";
import { reachableWorkspaces, toolAccessFor, touchGrants } from "@/lib/services/mcp-access";
import { authenticateAccessToken, getClient, oauthIssuer, OAUTH_SCOPE } from "@/lib/services/oauth";

import { isToolVisible, toolError, toolResult, type McpPrincipal } from "./tool";
import { MCP_TOOLS } from "./tools";

const METHODS = "POST, GET, DELETE, OPTIONS";
/** Generous for a person working through an AI app; it blunts a runaway loop. */
const CALLS_PER_MINUTE = 240;
/** Unauthenticated probes (discovery, expired tokens) per address. */
const ANONYMOUS_PER_MINUTE = 60;

const INSTRUCTIONS = `${brand.name} runs comment-to-DM automations for Instagram and Facebook: automations with flows, AI agents, an inbox, contacts with pipelines and segments, broadcasts, tracked links and analytics.
You act as the signed-in person, with the role they hold in each workspace.
Start with list_workspaces. When it lists more than one workspace, pass workspaceId to every other tool.
Connected Instagram accounts and Facebook Pages are "accounts"; their id is the channelId other tools take (list_accounts).
Before building or editing an automation flow, read get_automation_guide.
send_message, send_broadcast and turning an automation ACTIVE reach real people, and delete tools cannot be undone: confirm with the person first.`;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  const code = status === 401 ? -32001 : status === 429 ? -32002 : -32000;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(METHODS), ...headers },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** RFC 9728: a 401 points the app at the metadata that says where to sign in. */
function unauthorized(invalidToken: boolean): Response {
  const metadata = `${oauthIssuer()}/.well-known/oauth-protected-resource/mcp`;
  const challenge = invalidToken
    ? `Bearer error="invalid_token", error_description="The access token is expired or revoked", resource_metadata="${metadata}", scope="${OAUTH_SCOPE}"`
    : `Bearer resource_metadata="${metadata}", scope="${OAUTH_SCOPE}"`;
  return jsonRpcError(401, "Sign in to Awwtomation to use this server.", { "WWW-Authenticate": challenge });
}

function buildServer(principal: McpPrincipal): McpServer {
  const server = new McpServer(
    {
      name: "awwtomation",
      title: brand.name,
      version: "1.0.0",
      websiteUrl: oauthIssuer(),
      icons: [{ src: `${oauthIssuer()}/apple-touch-icon.png`, mimeType: "image/png", sizes: ["180x180"] }],
    },
    { instructions: INSTRUCTIONS },
  );

  // Only what this person can use somewhere: the role it needs, and not turned off by an owner.
  for (const tool of MCP_TOOLS) {
    if (!isToolVisible(tool, principal)) continue;
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: { title: tool.title, ...tool.annotations } },
      async (args: Record<string, unknown>) => {
        const started = Date.now();
        try {
          const value = await tool.run(args, principal);
          logger.info("mcp.tool_call", { tool: tool.name, userId: principal.user.id, clientId: principal.clientId, ms: Date.now() - started, ok: true });
          return toolResult(value);
        } catch (err) {
          logger.info("mcp.tool_call", { tool: tool.name, userId: principal.user.id, clientId: principal.clientId, ms: Date.now() - started, ok: false });
          return toolError(err);
        }
      },
    );
  }
  return server;
}

export async function handleMcpRequest(req: Request): Promise<Response> {
  // Stateless: there is no stream to open and no session to end.
  if (req.method !== "POST") return jsonRpcError(405, "Use POST.", { Allow: "POST, OPTIONS" });

  const token = bearerToken(req);
  const identity = token ? await authenticateAccessToken(token) : null;
  if (!identity) {
    const limit = await checkRateLimit("mcp_anonymous", clientIp(req), ANONYMOUS_PER_MINUTE, ONE_MINUTE_MS);
    if (!limit.allowed) return jsonRpcError(429, "Too many requests. Try again in a minute.", { "Retry-After": String(limit.retryAfterSeconds) });
    return unauthorized(Boolean(token));
  }

  const limit = await checkRateLimit("mcp_calls", identity.userId, CALLS_PER_MINUTE, ONE_MINUTE_MS);
  if (!limit.allowed) return jsonRpcError(429, "Too many requests. Try again in a minute.", { "Retry-After": String(limit.retryAfterSeconds) });

  const [user, client, reachable] = await Promise.all([
    prisma.user.findUnique({ where: { id: identity.userId } }),
    getClient(identity.clientId),
    reachableWorkspaces(identity.userId, identity.clientId),
  ]);
  if (!user || !client) return unauthorized(true);
  void touchGrants(Array.from(new Set(reachable.map((r) => r.grantId))));
  const toolAccess = await toolAccessFor(Array.from(new Set(reachable.map((r) => r.organization.id))));

  const server = buildServer({ user, clientId: client.clientId, clientName: client.clientName, reachable, toolAccess });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(corsHeaders(METHODS))) headers.set(key, value);
    // JSON mode buffers the whole reply, so the body is complete before the server closes.
    const body = await res.text();
    return new Response(body, { status: res.status, headers });
  } catch (err) {
    logger.error("mcp.request_failed", { userId: user.id, clientId: client.clientId, error: err });
    return jsonRpcError(500, "The server hit an error. Try again.");
  } finally {
    await server.close().catch(() => undefined);
  }
}

export function mcpPreflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders(METHODS) });
}
