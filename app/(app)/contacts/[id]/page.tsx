import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ExternalLink, Inbox } from "lucide-react";

import { ContactAvatar } from "@/components/contacts/contact-avatar";
import { ContactDetailsCard, type EditableContact } from "@/components/contacts/contact-details-card";
import { buildTimeline, ContactTimeline } from "@/components/contacts/contact-timeline";
import { contactDisplayName, contactProfileUrl, formatAbsolute, formatDate, formatRelative, platformLabel } from "@/components/contacts/format";
import { SegmentChips } from "@/components/contacts/segments-chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { getContact, listTags } from "@/lib/services/contacts";
import { segmentsForContact } from "@/lib/services/segments";
import { formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contact" };

/** Custom fields are free-form JSON; the editor works in strings, so flatten anything nested. */
function editableFields(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return out;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const [detail, tags, membership] = await Promise.all([getContact(ctx.workspace.id, id), listTags(ctx.workspace.id), segmentsForContact(ctx.workspace.id, id)]);
  if (!detail) notFound();

  const { contact, conversation, stats } = detail;
  const timezone = ctx.workspace.timezone;
  const displayName = contactDisplayName(contact);
  const username = contact.username?.replace(/^@/, "") ?? null;
  const profileUrl = contactProfileUrl(contact);
  const channelHandle = contact.channel.username ? `@${contact.channel.username.replace(/^@/, "")}` : (contact.channel.name ?? "channel");
  const events = buildTimeline(detail);

  const editable: EditableContact = {
    id: contact.id,
    name: contact.name,
    username,
    tags: contact.tags,
    customFields: editableFields(contact.customFields),
    optedOut: contact.optedOut,
  };

  return (
    <>
      <PageHeader
        backHref="/contacts"
        backLabel="Contacts"
        title={
          <span className="flex items-center gap-3">
            <ContactAvatar name={contact.name} username={username} avatarUrl={contact.avatarUrl} platform={contact.platform} size="lg" />
            <span className="flex flex-col">
              <span className="flex flex-wrap items-center gap-2">
                {displayName}
                {contact.isFollower ? <Badge variant="success">Follower</Badge> : null}
                {contact.optedOut ? <Badge variant="warning">Opted out</Badge> : null}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm font-normal tracking-normal text-muted-foreground">
                {username && contact.name ? <span>@{username}</span> : null}
                {username && contact.name ? <span aria-hidden>·</span> : null}
                <span className="inline-flex items-center gap-1">
                  <PlatformIcon platform={contact.platform} size={13} />
                  {platformLabel(contact.platform)}
                </span>
                <span aria-hidden>·</span>
                <span>via {channelHandle}</span>
              </span>
            </span>
          </span>
        }
        actions={
          <>
            {profileUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Open on {platformLabel(contact.platform)}
                </a>
              </Button>
            ) : null}
            {conversation ? (
              <Button size="sm" asChild>
                <Link href={`/inbox?c=${encodeURIComponent(conversation.id)}`}>
                  <Inbox />
                  Open in Inbox
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div>
          <ContactDetailsCard contact={editable} allTags={tags.map((t) => t.tag)} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Engagement across every automation and broadcast on this account.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <Stat label="DMs received" value={formatNumber(stats.dmsReceived)} />
                <Stat label="Link clicks" value={formatNumber(stats.linkClicks)} />
                <Stat label="Flows entered" value={formatNumber(stats.flowSessions)} />
              </div>
              <div className="mt-4 divide-y border-t">
                <Row label="First seen">
                  <time dateTime={contact.firstSeenAt.toISOString()} title={formatAbsolute(contact.firstSeenAt, timezone)}>
                    {formatDate(contact.firstSeenAt, timezone)}
                  </time>
                </Row>
                <Row label="Last interaction">
                  {contact.lastInteractionAt ? (
                    <time dateTime={contact.lastInteractionAt.toISOString()} title={formatAbsolute(contact.lastInteractionAt, timezone)} suppressHydrationWarning>
                      {formatRelative(contact.lastInteractionAt)}
                    </time>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label="Messaging window">
                  {conversation?.windowOpen && conversation.windowClosesAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                      Open · closes <span suppressHydrationWarning>{formatRelative(conversation.windowClosesAt)}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground" title="Meta only allows messages within 24h of the contact's last message">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
                      Closed
                    </span>
                  )}
                </Row>
                {conversation ? (
                  <Row label="Conversation">
                    <Link href={`/inbox?c=${encodeURIComponent(conversation.id)}`} className="hover:underline">
                      {conversation.status === "OPEN" ? "Open" : "Closed"}
                      {conversation.unreadCount > 0 ? ` · ${conversation.unreadCount} unread` : ""}
                    </Link>
                  </Row>
                ) : null}
                <Row label="Segments">
                  <SegmentChips segments={membership.segments} truncated={membership.truncated} />
                </Row>
                <Row label="Platform id">
                  <span className="font-mono text-[12px] text-muted-foreground">{contact.externalId}</span>
                </Row>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Most recent messages, deliveries, flows and clicks.</CardDescription>
            </CardHeader>
            <CardContent>
              <ContactTimeline events={events} timezone={timezone} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
