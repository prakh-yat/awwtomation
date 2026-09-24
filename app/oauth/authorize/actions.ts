"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { saveConsent } from "@/lib/services/mcp-access";
import { getClient, isOwnResource, isRegisteredRedirect, issueAuthorizationCode } from "@/lib/services/oauth";

const decisionSchema = z.object({
  decision: z.enum(["allow", "deny"]),
  clientId: z.string().min(1).max(200),
  redirectUri: z.string().min(1).max(2000),
  state: z.string().max(2000).optional(),
  codeChallenge: z.string().min(43).max(128),
  resource: z.string().max(2000).optional(),
  selections: z
    .array(
      z.object({
        organizationId: z.string().min(1).max(64),
        all: z.boolean(),
        workspaceIds: z.array(z.string().min(1).max(64)).max(500),
      }),
    )
    .max(100),
});

export type DecisionResult = { ok: true; redirectTo: string } | { ok: false; error: string };

function withQuery(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * The consent screen's Allow and Cancel. Everything the page checked is
 * checked again here, because the browser sends it back. Allow stores what the
 * app may reach, then hands the app a one-time code at its registered address.
 */
export async function decideAuthorization(input: unknown): Promise<DecisionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This request is no longer valid. Start again from the app." };
  const request = parsed.data;

  const client = await getClient(request.clientId);
  if (!client || !isRegisteredRedirect(client, request.redirectUri) || !isOwnResource(request.resource)) {
    return { ok: false, error: "This request is no longer valid. Start again from the app." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session ended. Sign in again and retry from the app." };

  if (request.decision === "deny") {
    logger.info("mcp.consent_denied", { userId: user.id, clientId: client.clientId });
    return {
      ok: true,
      redirectTo: withQuery(request.redirectUri, { error: "access_denied", error_description: "The request was declined.", state: request.state }),
    };
  }

  if (!request.selections.some((s) => s.all || s.workspaceIds.length > 0)) {
    return { ok: false, error: "Pick at least one workspace." };
  }

  const reachable = await saveConsent({ user, clientId: client.clientId, clientName: client.clientName, selections: request.selections });
  if (reachable === 0) return { ok: false, error: "Pick at least one workspace." };

  const code = await issueAuthorizationCode({
    clientId: client.clientId,
    userId: user.id,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
  });
  return { ok: true, redirectTo: withQuery(request.redirectUri, { code, state: request.state }) };
}
