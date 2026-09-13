import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { ContactActivity } from "@/components/contacts/contact-activity";
import { ContactAvatar } from "@/components/contacts/contact-avatar";
import { ContactMessagingCard, ContactPropertiesCard, ContactTagsCard, type EditableContact } from "@/components/contacts/contact-details-card";
import { ContactHeaderActions } from "@/components/contacts/contact-header-actions";
import { ContactPipelinesCard } from "@/components/contacts/contact-pipelines-card";
import { contactDisplayName, contactProfileUrl, formatAbsolute, formatDate, formatRelative, platformLabel } from "@/components/contacts/format";
import { SegmentChips } from "@/components/contacts/segments-chips";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { getContact, listOwners, listTags } from "@/lib/services/contacts";
import { listPipelines } from "@/lib/services/pipelines";
import { formatNumber } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageSettings } from "@/lib/workspace/permissions";

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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

const SOURCE_LABEL = { WEBHOOK: null, MANUAL: "Added by hand", IMPORT: "Imported" } as const;

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const [detail, tags, owners, pipelines] = await Promise.all([
    getContact(ctx.workspace.id, id),
    listTags(ctx.workspace.id),
    listOwners(ctx.workspace.id),
    listPipelines(ctx.workspace.id),
  ]);
  if (!detail) notFound();

  const { contact, conversation, stats } = detail;
  const timezone = ctx.workspace.timezone;
  const displayName = contactDisplayName(contact);
  const username = contact.username?.replace(/^@/, "") ?? null;
  const profileUrl = contactProfileUrl(contact);
  const account = contact.channel.username ? `@${contact.channel.username.replace(/^@/, "")}` : (contact.channel.name ?? "your account");
  const source = SOURCE_LABEL[contact.source];

  const editable: EditableContact = {
    id: contact.id,
    name: contact.name,
    username,
    email: contact.email,
    phone: contact.phone,
    ownerId: contact.ownerId,
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
          <span className="flex items-center gap-4">
            <ContactAvatar name={contact.name} username={username} avatarUrl={contact.avatarUrl} platform={contact.platform} size="lg" />
            <span className="flex min-w-0 flex-col">
              <span className="flex flex-wrap items-center gap-2">
                {displayName}
                {contact.optedOut ? <Badge variant="warning">Messages stopped</Badge> : null}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm font-normal tracking-normal text-muted-foreground">
                {username && contact.name ? <span>@{username}</span> : null}
                {username && contact.name ? <span aria-hidden>·</span> : null}
                <span className="inline-flex items-center gap-1">
                  <PlatformIcon platform={contact.platform} size={13} />
                  {account}
                </span>
                {source ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{source}</span>
                  </>
                ) : null}
              </span>
            </span>
          </span>
        }
        actions={
          <ContactHeaderActions
            contactId={contact.id}
            displayName={displayName}
            profileUrl={profileUrl}
            platformLabel={`View on ${platformLabel(contact.platform)}`}
            conversationId={conversation?.id ?? null}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ContactPipelinesCard
            contactId={contact.id}
            contactName={displayName}
            pipelines={pipelines}
            entries={detail.pipelines}
            canManagePipelines={canManageSettings(ctx.role)}
          />
          <ContactPropertiesCard contact={editable} owners={owners} />
          <ContactTagsCard contact={editable} allTags={tags.map((t) => t.tag)} />
          <ContactMessagingCard contact={editable}>
            <div className="divide-y text-[13px]">
              <Row label="Follows you">{contact.isFollower === null ? <span className="text-muted-foreground">Not known yet</span> : contact.isFollower ? "Yes" : "No"}</Row>
              <Row label="Can reply until">
                {!contact.messageable ? (
                  <span className="text-muted-foreground">After they message you</span>
                ) : conversation?.windowOpen && conversation.windowClosesAt ? (
                  <time dateTime={conversation.windowClosesAt.toISOString()} title={formatAbsolute(conversation.windowClosesAt, timezone)}>
                    {formatAbsolute(conversation.windowClosesAt, timezone)}
                  </time>
                ) : (
                  <span className="text-muted-foreground">Closed until they message you</span>
                )}
              </Row>
            </div>
          </ContactMessagingCard>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
              <Figure label="DMs received" value={formatNumber(stats.dmsReceived)} />
              <Figure label="Link clicks" value={formatNumber(stats.linkClicks)} />
              <Figure label="Automation runs" value={formatNumber(stats.flowSessions)} />
              <Figure label="Notes" value={formatNumber(stats.notes)} />
            </div>
            <CardContent className="border-t py-1">
              <div className="divide-y">
                <Row label="First seen">
                  <time dateTime={contact.firstSeenAt.toISOString()} title={formatAbsolute(contact.firstSeenAt, timezone)}>
                    {formatDate(contact.firstSeenAt, timezone)}
                  </time>
                </Row>
                <Row label="Last activity">
                  {contact.lastInteractionAt ? (
                    <time dateTime={contact.lastInteractionAt.toISOString()} title={formatAbsolute(contact.lastInteractionAt, timezone)} suppressHydrationWarning>
                      {formatRelative(contact.lastInteractionAt)}
                    </time>
                  ) : (
                    <span className="text-muted-foreground">None yet</span>
                  )}
                </Row>
                {conversation ? (
                  <Row label="Conversation">
                    <Link href={`/inbox?c=${encodeURIComponent(conversation.id)}`} className="underline-offset-4 hover:underline">
                      {conversation.status === "OPEN" ? "Open" : "Closed"}
                      {conversation.unreadCount > 0 ? ` · ${conversation.unreadCount} unread` : ""}
                    </Link>
                  </Row>
                ) : null}
                <Row label="Segments">
                  <SegmentChips segments={detail.segments.segments} truncated={detail.segments.truncated} />
                </Row>
              </div>
            </CardContent>
          </Card>

          <ContactActivity contactId={contact.id} events={detail.timeline} timezone={timezone} viewer={{ id: ctx.user.id, role: ctx.role }} />
        </div>
      </div>
    </>
  );
}
