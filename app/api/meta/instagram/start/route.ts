import { withWorkspace } from "@/lib/workspace/api";

import { OAUTH_START_LIMIT_PER_MINUTE, startOAuth } from "../../_shared/oauth";
import { enforceIpRateLimit, ONE_MINUTE_MS } from "@/lib/security/rate-limit-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kicks off Instagram Login. Register `${NEXT_PUBLIC_APP_URL}/api/meta/instagram/callback` as the OAuth redirect URI. */
export const GET = withWorkspace(async (req, ctx) => {
  const limited = enforceIpRateLimit(req, "oauth_start", OAUTH_START_LIMIT_PER_MINUTE, ONE_MINUTE_MS);
  if (limited) return limited;
  return startOAuth(ctx, "INSTAGRAM");
});
