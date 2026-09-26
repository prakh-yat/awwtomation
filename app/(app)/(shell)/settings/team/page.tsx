import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InviteDialog } from "@/components/settings/invite-dialog";
import { InvitationsTable, MembersTable, type PendingInvitation, type TeamMember } from "@/components/settings/team-table";
import { Meter } from "@/components/settings/usage-bars";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationUsage } from "@/lib/billing/usage";
import { listInvitations, listMembers } from "@/lib/services/organizations";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageTeam } from "@/lib/workspace/permissions";

export const metadata: Metadata = { title: "Team" };

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
      <PageHeader title="Settings" actions={invite} />
      <div className="space-y-10">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="brand-label text-muted-foreground">Members</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
              {seatsFull ? (
                <span className="inline-flex items-center gap-2">
                  <Badge variant="warning">All seats in use</Badge>
                  <Link href="/settings/billing" className="font-semibold text-ink underline underline-offset-4 hover:no-underline">
                    Upgrade
                  </Link>
                </span>
              ) : null}
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-ink">{seats.used}</span> of {seats.limit} seats
              </span>
              <Meter used={seats.used} limit={seats.limit} label="Team seats used" tone="indigo" className="w-20 sm:w-28" />
            </div>
          </div>
          <Card className="overflow-hidden">
            <MembersTable organizationId={organizationId} members={members} currentUserId={ctx.user.id} actorRole={ctx.role} />
          </Card>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="brand-label text-muted-foreground">Pending invitations</h2>
            {invitations.length > 0 ? <Badge variant="secondary">{invitations.length}</Badge> : null}
            {invitations.length > 0 ? <p className="ml-auto text-xs text-muted-foreground">Open invites hold a seat.</p> : null}
          </div>
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
