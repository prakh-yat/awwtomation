import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InviteDialog } from "@/components/settings/invite-dialog";
import { InvitationsTable, MembersTable, type PendingInvitation, type TeamMember } from "@/components/settings/team-table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationUsage } from "@/lib/billing/usage";
import { listInvitations, listMembers } from "@/lib/services/organizations";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageTeam } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "Team" };

function SectionHeader({ title, description, actions }: { title: string; description: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <div className="mt-0.5 text-[13px] text-muted-foreground">{description}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export default async function TeamSettingsPage() {
  const ctx = await requireWorkspaceContext();
  if (!canManageTeam(ctx.role)) redirect("/settings");
  const organizationId = ctx.organization.id;

  const [memberRows, invitationRows, usage] = await Promise.all([
    listMembers(organizationId),
    listInvitations(organizationId, { status: "PENDING", includeLinks: true }),
    getOrganizationUsage(organizationId),
  ]);

  // Plain-data props: dates go over the RSC boundary as ISO strings.
  const members: TeamMember[] = memberRows.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
  }));
  const invitations: PendingInvitation[] = invitationRows.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
    expired: i.expired,
    inviteUrl: i.inviteUrl ?? null,
    invitedBy: i.invitedBy?.name ?? i.invitedBy?.email ?? null,
  }));

  const seats = { used: usage.members.used, limit: usage.members.limit };
  const seatsFull = seats.used >= seats.limit;
  const invite = <InviteDialog actorRole={ctx.role} seats={seats} />;

  return (
    <div>
      <PageHeader
        title="Settings"
        actions={invite}
      />
      <div className="space-y-8">
      <section>
        <SectionHeader
          title="Members"
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                {seats.used} of {seats.limit} seats used
              </span>
              {seatsFull ? (
                <Badge variant="warning">
                  All seats in use.{" "}
                  <Link href="/settings/billing" className="underline underline-offset-2">
                    Upgrade
                  </Link>
                </Badge>
              ) : null}
              <span className="text-muted-foreground/70">· pending invitations use a seat</span>
            </span>
          }
        />
        <Card className="overflow-hidden">
          <MembersTable organizationId={organizationId} members={members} currentUserId={ctx.user.id} actorRole={ctx.role} />
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Pending invitations"
          description="Links are valid for 7 days and tied to the invited email address."
        />
        {invitations.length > 0 ? (
          <Card className="overflow-hidden">
            <InvitationsTable invitations={invitations} />
          </Card>
        ) : (
          <InvitationsTable invitations={invitations} inviteAction={invite} />
        )}
      </section>
      </div>
    </div>
  );
}
