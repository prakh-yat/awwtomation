import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ban, CircleAlert, CircleCheck, Link2Off, TimerOff, UserCheck, UserRoundX, type LucideIcon } from "lucide-react";

import { CenteredPage } from "@/components/layout/centered-page";
import { GridBlock } from "@/components/layout/grid-block";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TONES, type Tone } from "@/components/ui/tone";
import { getCurrentUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { getInvitationByToken, getOrganizationMembership, invitationState } from "@/lib/services/organizations";
import { cn } from "@/lib/utils";
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
  PLAN_LIMIT: "This team is full. Ask the owner to upgrade the plan.",
  UNKNOWN: "Couldn't accept the invitation. Try again.",
};

const primaryLink = cn(buttonVariants({ size: "lg" }), "h-12 w-full");
const outlineLink = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 w-full");

/** `/auth/signout` is a route handler: always a plain `<a>`, since a prefetch would sign you out. */
function switchAccountHref(token: string): string {
  return `/auth/signout?next=${encodeURIComponent(`/invite/${token}`)}`;
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function Shell({ children }: { children: React.ReactNode }) {
  return <CenteredPage>{children}</CenteredPage>;
}

/** Every dead end looks the same: a tilted colour tile, what happened, and one way on. */
function Notice({
  icon: Icon,
  tone,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className={cn(
          "flex h-14 w-14 rotate-[-4deg] items-center justify-center rounded-2xl shadow-[0_10px_24px_-12px_rgb(15_15_15/0.45)]",
          TONES[tone].solid,
        )}
      >
        <Icon className="h-6 w-6" strokeWidth={1.9} aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-[28px] leading-[1.05] text-balance">{title}</h1>
      <p className="mt-3 max-w-sm text-[14px] text-muted-foreground">{body}</p>
      {children ? <div className="mt-7 w-full">{children}</div> : null}
    </div>
  );
}

function HomeLink() {
  return (
    <Link href="/dashboard" className={outlineLink}>
      Go to {brand.name}
    </Link>
  );
}

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
        <Notice icon={Link2Off} tone="orange" title="Invalid invitation" body="Check that you copied the whole link.">
          <Link href="/dashboard" className={primaryLink}>
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
    const role = roleLabel(membership.role);
    return (
      <Shell>
        <Notice
          icon={UserCheck}
          tone="green"
          title={`You're already in ${organizationName}`}
          body={`You're ${article(role)} ${role.toLowerCase()} here.`}
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
        <Notice icon={Ban} tone="ink" title="Invitation revoked" body={`Ask an admin of ${organizationName} for a new link.`}>
          <HomeLink />
        </Notice>
      </Shell>
    );
  }
  if (state === "EXPIRED") {
    return (
      <Shell>
        <Notice
          icon={TimerOff}
          tone="orange"
          title="Invitation expired"
          body={`Ask ${invitation.invitedBy?.name ?? "the person who invited you"} for a new link to ${organizationName}.`}
        >
          <HomeLink />
        </Notice>
      </Shell>
    );
  }
  if (state === "ACCEPTED") {
    return (
      <Shell>
        <Notice
          icon={CircleCheck}
          tone="lavender"
          title="Invitation already used"
          body={`If you didn't use it, ask an admin of ${organizationName} for a new link.`}
        >
          <HomeLink />
        </Notice>
      </Shell>
    );
  }
  if (state === "EMAIL_MISMATCH") {
    return (
      <Shell>
        <Notice
          icon={UserRoundX}
          tone="yellow"
          title="Wrong Google account"
          body={
            <>
              This invitation is for <span className="font-semibold text-ink">{invitation.email}</span>. You&apos;re signed in as{" "}
              <span className="font-semibold text-ink">{user.email}</span>.
            </>
          }
        >
          <a href={switchAccountHref(token)} className={primaryLink}>
            Switch account
          </a>
        </Notice>
      </Shell>
    );
  }

  const inviterName = invitation.invitedBy?.name ?? invitation.invitedBy?.email ?? "A teammate";
  const errorMessage = error ? (ACTION_ERRORS[error] ?? ACTION_ERRORS.UNKNOWN) : null;

  return (
    <CenteredPage
      banner={
        <GridBlock tone="purple" gridSize="44px" className="px-6 pb-7 pt-7 sm:px-8 sm:pt-8">
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white font-display text-[22px] text-ink">
            {organizationName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <h1 className="mt-6 font-display text-[32px] leading-[1.02] text-balance sm:text-[36px]">Join {organizationName}</h1>
          <p className="mt-2 text-[15px] text-white/85">Invited by {inviterName}</p>
        </GridBlock>
      }
    >
      <div className="space-y-6">
        {errorMessage ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] leading-5 text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{errorMessage}</p>
          </div>
        ) : null}

        <dl className="divide-y rounded-2xl border text-[14px]">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-muted-foreground">Role</dt>
            <dd>
              <Badge variant="purple">{roleLabel(invitation.role)}</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-muted-foreground">Workspaces</dt>
            <dd className="font-semibold tabular-nums">{workspaceCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-muted-foreground">Signed in as</dt>
            <dd className="min-w-0 truncate font-semibold">{user.email}</dd>
          </div>
        </dl>

        <form action={acceptInviteAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <SubmitButton pendingLabel="Joining…">Accept invitation</SubmitButton>
          <p className="text-center text-[13px] text-muted-foreground">
            Not you?{" "}
            <a href={switchAccountHref(token)} className="font-medium text-ink underline underline-offset-4 hover:text-ink/70">
              Switch account
            </a>
          </p>
        </form>
      </div>
    </CenteredPage>
  );
}
