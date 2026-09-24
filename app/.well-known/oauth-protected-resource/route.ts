import { discoveryPreflight, protectedResourceResponse } from "@/lib/oauth/discovery";

export const dynamic = "force-dynamic";

/** RFC 9728 protected resource metadata: where /mcp's tokens come from. */
export function GET() {
  return protectedResourceResponse();
}

export function OPTIONS() {
  return discoveryPreflight();
}
