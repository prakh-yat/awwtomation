import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CenteredPage } from "@/components/layout/centered-page";
import { getCurrentUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { getInvitationByToken, getOrganizationMembership, invitationState } from "@/lib/services/organizations";
import { roleLabel } from "@/lib/workspace/permissions";

import { acceptInviteAction, openOrganizationAction } from "./actions";
import { SubmitButton } from "./submit-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Join an organization" };

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/** Messages for `?error=` codes the server action can bounce back with. */
const ACTION_ERRORS: Record<string, string> = {
  INVITE_NOT_FOUND: "This invitation link is invalid.",
  INVITE_USED: "This invitation has already been used.",
  INVITE_REVOKED: "An admin of the organization revoked this invitation.",
  INVITE_EXPIRED: "This invitation has expired. Ask the person who invited you for a new link.",
  INVITE_EMAIL_MISMATCH: "This invitation was sent to a different email address.",
  PLAN_LIMIT: "This organization has reached its team member limit. Ask the owner to upgrade their plan.",
  UNKNOWN: "Something went wrong while accepting the invitation. Please try again.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return <CenteredPage>{children}</CenteredPage>;
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4 text-center">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}

const secondaryLink =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-foreground shadow-card transition-colors hover:bg-secondary";

export default async function InvitePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { token } = await params;
  const { error: rawError } = await searchParams;
  const error = Array.isArray(rawError) ? rawError[0] : rawError;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    return (
      <Shell>
        <Notice title="Invalid invitation" body="This link doesn't match any invitation. Check that you copied the whole URL.">
          <Link href="/dashboard" className={secondaryLink}>
            Go to {brand.name}
          </Link>
        </Notice>
      </Shell>
    );
  }

  const membership = await getOrganizationMembership(invitation.organizationId, user.id);
  const state = invitationState(invitation, user.email);
  const organizationName = invitation.organization.name;
  const workspaceCount = invitation.organization._count.workspaces;

  // Already on the team (accepted earlier, or added another way): just open it.
  if (membership) {
    return (
      <Shell>
        <Notice
          title={`You're already in ${organizationName}`}
          body={`You're ${/^[aeiou]/i.test(roleLabel(membership.role)) ? "an" : "a"} ${roleLabel(membership.role).toLowerCase()} of this organization.`}
        >
          <form action={openOrganizationAction}>
            <input type="hidden" name="organizationId" value={invitation.organizationId} />
            <SubmitButton pendingLabel="Opening…">Open organization</SubmitButton>
          </form>
        </Notice>
      </Shell>
    );
  }

  if (state === "REVOKED") {
    return (
      <Shell>
        <Notice title="Invitation revoked" body={`An admin of ${organizationName} cancelled this invitation. Ask them for a new link if you still need access.`} />
      </Shell>
    );
  }
  if (state === "EXPIRED") {
    return (
      <Shell>
        <Notice title="Invitation expired" body={`Invitations are valid for 7 days. Ask ${invitation.invitedBy?.name ?? "the person who invited you"} to send a fresh link to ${organizationName}.`} />
      </Shell>
    );
  }
  if (state === "ACCEPTED") {
    return (
      <Shell>
        <Notice title="Invitation already used" body="Someone has already joined with this link. If that wasn't you, ask an admin of the organization for a new invitation." />
      </Shell>
    );
  }
  if (state === "EMAIL_MISMATCH") {
    return (
      <Shell>
        <Notice
          title="Wrong Google account"
          body={`This invitation was sent to ${invitation.email}, but you're signed in as ${user.email}. Sign out and sign in with the invited address.`}
        >
          <Link href={`/auth/signout?next=${encodeURIComponent(`/invite/${token}`)}`} className={secondaryLink}>
            Sign out
          </Link>
        </Notice>
      </Shell>
    );
  }

  const inviterName = invitation.invitedBy?.name ?? invitation.invitedBy?.email ?? "A teammate";
  const errorMessage = error ? (ACTION_ERRORS[error] ?? ACTION_ERRORS.UNKNOWN) : null;

  return (
    <Shell>
      <div className="space-y-6">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Join {organizationName}</h1>
          <p className="text-sm text-muted-foreground">
            {inviterName} invited you to join as {/^[aeiou]/i.test(roleLabel(invitation.role)) ? "an" : "a"} {roleLabel(invitation.role).toLowerCase()}.
          </p>
        </div>

        {errorMessage ? (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <dl className="divide-y rounded-md border text-sm">
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Organization</dt>
            <dd className="font-medium">{organizationName}</dd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Workspaces you&apos;ll see</dt>
            <dd className="font-medium tabular-nums">{workspaceCount}</dd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Your role</dt>
            <dd className="font-medium">{roleLabel(invitation.role)}</dd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Signed in as</dt>
            <dd className="max-w-[60%] truncate font-medium">{user.email}</dd>
          </div>
        </dl>

        <form action={acceptInviteAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <SubmitButton pendingLabel="Joining…">Accept invitation</SubmitButton>
          <p className="text-center text-xs text-muted-foreground">
            Not you?{" "}
            <Link
              href={`/auth/signout?next=${encodeURIComponent(`/invite/${token}`)}`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Sign out
            </Link>
          </p>
        </form>
      </div>
    </Shell>
  );
}
