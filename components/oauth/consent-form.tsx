"use client";

import * as React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { decideAuthorization } from "@/app/oauth/authorize/actions";
import type { ConsentOrganization } from "@/lib/services/mcp-access";
import { roleLabel } from "@/lib/workspace/permissions";

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource?: string;
};

type Selection = { all: boolean; workspaceIds: Set<string> };

/**
 * A re-consent starts from what the app can reach today. A first consent
 * starts with everything ticked, which is also what "every workspace,
 * including new ones" means.
 */
function initialPicks(organizations: ConsentOrganization[]): Map<string, Selection> {
  const reconsent = organizations.some((o) => o.current);
  return new Map(
    organizations.map((o) => {
      if (!reconsent) return [o.id, { all: true, workspaceIds: new Set(o.workspaces.map((w) => w.id)) }];
      if (!o.current) return [o.id, { all: false, workspaceIds: new Set<string>() }];
      const ids = o.current.all ? o.workspaces.map((w) => w.id) : o.current.workspaceIds;
      return [o.id, { all: o.current.all, workspaceIds: new Set(ids) }];
    }),
  );
}

/** Every workspace ticked is stored as the whole organization, so a workspace added later is included too. */
function normalise(org: ConsentOrganization, ids: Set<string>): Selection {
  const all = org.workspaces.length > 0 && org.workspaces.every((w) => ids.has(w.id));
  return { all, workspaceIds: ids };
}

export function ConsentForm({
  request,
  app,
  user,
  organizations,
}: {
  request: AuthorizeRequest;
  app: { name: string; host: string };
  user: { email: string };
  organizations: ConsentOrganization[];
}) {
  const [picks, setPicks] = React.useState(() => initialPicks(organizations));
  const [pending, setPending] = React.useState<"allow" | "deny" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const selectedCount = organizations.reduce((sum, o) => sum + (picks.get(o.id)?.workspaceIds.size ?? 0), 0);

  function toggleOrganization(org: ConsentOrganization, checked: boolean) {
    setPicks((prev) => {
      const next = new Map(prev);
      next.set(org.id, normalise(org, new Set(checked ? org.workspaces.map((w) => w.id) : [])));
      return next;
    });
  }

  function toggleWorkspace(org: ConsentOrganization, workspaceId: string, checked: boolean) {
    setPicks((prev) => {
      const next = new Map(prev);
      const ids = new Set(prev.get(org.id)?.workspaceIds ?? []);
      if (checked) ids.add(workspaceId);
      else ids.delete(workspaceId);
      next.set(org.id, normalise(org, ids));
      return next;
    });
  }

  async function decide(decision: "allow" | "deny") {
    setPending(decision);
    setError(null);
    const result = await decideAuthorization({
      decision,
      ...request,
      selections: organizations.map((o) => {
        const pick = picks.get(o.id);
        return { organizationId: o.id, all: pick?.all ?? false, workspaceIds: Array.from(pick?.workspaceIds ?? []) };
      }),
    }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));

    if (!result.ok) {
      setError(result.error);
      setPending(null);
      return;
    }
    // A plain navigation, not a form post: the app's return address is on
    // another origin, and some are an app's own scheme (cursor://).
    if (decision === "allow") setDone(true);
    window.location.assign(result.redirectTo);
  }

  if (done) {
    return (
      <div className="rounded-2xl border bg-card p-6 sm:p-7">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-soft text-green-ink">
          <CircleCheck className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-[28px] leading-none">Connected</h1>
        <p className="mt-3 text-[14px] leading-6 text-muted-foreground">Go back to {app.name} to use it. You can close this tab.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card">
      <div className="px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
        <p className="brand-label text-muted-foreground">Connect an app</p>
        <h1 className="mt-3 text-balance font-display text-[30px] leading-[0.95] sm:text-[34px]">{app.name} wants to use your Awwtomation</h1>
        <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
          Signed in as <span className="font-medium text-ink">{user.email}</span>. After you allow it, you go back to{" "}
          <span className="font-medium text-ink">{app.host}</span>.
        </p>
      </div>

      <div className="border-t px-6 py-5 sm:px-7">
        <h2 className="brand-label text-muted-foreground">Workspaces it can use</h2>
        {organizations.length === 0 ? (
          <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
            You are not in any workspace yet. Open Awwtomation to create one, then connect {app.name} again.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {organizations.map((org) => {
              const pick = picks.get(org.id);
              const count = pick?.workspaceIds.size ?? 0;
              const state = pick?.all ? true : count > 0 ? "indeterminate" : false;
              const single = org.workspaces.length === 1;
              return (
                <li key={org.id} className="rounded-xl border px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <Checkbox checked={state} onCheckedChange={(value) => toggleOrganization(org, value === true)} aria-label={`All of ${org.name}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{single ? org.workspaces[0].name : org.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {single ? `${org.name} · ` : ""}
                        {roleLabel(org.role)}
                        {pick?.all ? " · includes workspaces added later" : ""}
                      </span>
                    </span>
                  </label>
                  {single ? null : (
                    <ul className="mt-2 space-y-1.5 border-t pt-2.5">
                      {org.workspaces.map((workspace) => (
                        <li key={workspace.id}>
                          <label className="flex cursor-pointer items-center gap-3 pl-7 text-[13px]">
                            <Checkbox
                              checked={pick?.workspaceIds.has(workspace.id) ?? false}
                              onCheckedChange={(value) => toggleWorkspace(org, workspace.id, value === true)}
                            />
                            <span className="truncate">{workspace.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
          It acts as you, with your role in each workspace: it can build automations and AI agents, message contacts, send broadcasts and change what
          your role lets you change. You can disconnect it any time in Settings.
        </p>
      </div>

      {error ? (
        <div role="alert" className="mx-6 mb-4 flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] leading-5 text-destructive sm:mx-7">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t px-6 py-4 sm:px-7">
        <Button type="button" variant="outline" onClick={() => decide("deny")} loading={pending === "deny"} disabled={pending !== null}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="highlight"
          onClick={() => decide("allow")}
          loading={pending === "allow"}
          disabled={pending !== null || selectedCount === 0}
        >
          Allow
        </Button>
      </div>
    </div>
  );
}
