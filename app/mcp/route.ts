import { handleMcpRequest, mcpPreflight } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The MCP server AI apps connect to (Claude, ChatGPT, Cursor). One URL for
 * everyone: the OAuth access token decides who is calling and which
 * workspaces they may use. See lib/mcp/server.ts.
 */
export function POST(req: Request) {
  return handleMcpRequest(req);
}

export function GET(req: Request) {
  return handleMcpRequest(req);
}

export function DELETE(req: Request) {
  return handleMcpRequest(req);
}

export function OPTIONS() {
  return mcpPreflight();
}
