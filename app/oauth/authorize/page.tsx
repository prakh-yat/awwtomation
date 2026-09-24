import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthorizeError, AuthorizeShell } from "@/components/oauth/authorize-shell";
import { ConsentForm } from "@/components/oauth/consent-form";
import { getCurrentUser } from "@/lib/auth/session";
import { consentOptions } from "@/lib/services/mcp-access";
import { getClient, isOwnResource, isRegisteredRedirect, redirectHost } from "@/lib/services/oauth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect an app",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withQuery(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * GET /oauth/authorize: where an AI app sends someone to approve it.
 *
 * Until the client and its return address check out, errors are shown here;
 * after that they go back to the app (RFC 6749 section 4.1.2.1). A visitor who
 * is signed out goes through /login and comes back with the request intact.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const clientId = first(params.client_id) ?? "";
  const redirectUri = first(params.redirect_uri) ?? "";
  const state = first(params.state);
  const responseType = first(params.response_type);
  const codeChallenge = first(params.code_challenge);
  const codeChallengeMethod = first(params.code_challenge_method) ?? "plain";
  const resource = first(params.resource);

  const client = await getClient(clientId);
  if (!client) {
    return <AuthorizeError title="Unknown app" detail="This app is not registered with Awwtomation. Remove it in the app and add it again with your MCP URL." />;
  }
  if (!redirectUri || !isRegisteredRedirect(client, redirectUri)) {
    return <AuthorizeError title="Can't connect this app" detail="The app asked to return to an address it never registered. Remove it in the app and add it again." />;
  }

  if (responseType !== "code") redirect(withQuery(redirectUri, { error: "unsupported_response_type", state }));
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    redirect(withQuery(redirectUri, { error: "invalid_request", error_description: "PKCE with S256 is required.", state }));
  }
  if (!isOwnResource(resource)) redirect(withQuery(redirectUri, { error: "invalid_target", state }));

  const user = await getCurrentUser();
  if (!user) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = first(value);
      if (v !== undefined) query.set(key, v);
    }
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query.toString()}`)}`);
  }

  const organizations = await consentOptions(user.id, client.clientId);

  return (
    <AuthorizeShell>
      <ConsentForm
        request={{ clientId: client.clientId, redirectUri, state, codeChallenge, resource }}
        app={{ name: client.clientName, host: redirectHost(redirectUri) }}
        user={{ email: user.email }}
        organizations={organizations}
      />
    </AuthorizeShell>
  );
}
