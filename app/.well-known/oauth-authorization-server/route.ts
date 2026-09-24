import { authorizationServerResponse, discoveryPreflight } from "@/lib/oauth/discovery";

export const dynamic = "force-dynamic";

/** RFC 8414 authorization server metadata for the MCP endpoint's OAuth. */
export function GET() {
  return authorizationServerResponse();
}

export function OPTIONS() {
  return discoveryPreflight();
}
