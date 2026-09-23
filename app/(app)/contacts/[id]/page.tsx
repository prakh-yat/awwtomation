import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { ContactActivity } from "@/components/contacts/contact-activity";
import { ContactMessagingCard, ContactOwnerPicker, ContactPropertiesCard, ContactTagsCard, type EditableContact } from "@/components/contacts/contact-details-card";
import { ContactHeaderActions } from "@/components/contacts/contact-header-actions";
import { ContactHero } from "@/components/contacts/contact-hero";
import { ContactPipelinesCard } from "@/components/contacts/contact-pipelines-card";
import { contactDisplayName, contactProfileUrl, formatAbsolute, formatDate, formatRelative, platformLabel } from "@/components/contacts/format";
import { SegmentChips } from "@/components/contacts/segments-chips";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
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
  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.name, email: o.email, avatarUrl: o.avatarUrl }));

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
      <PageHeader backHref="/contacts" backLabel="All contacts" title="Contacts" />

      <ContactHero
        displayName={displayName}
        name={contact.name}
        username={username}
        handle={username && contact.name ? username : null}
        avatarUrl={contact.avatarUrl}
        platform={contact.platform}
        account={account}
        source={source}
        optedOut={contact.optedOut}
        owner={<ContactOwnerPicker contactId={contact.id} ownerId={contact.ownerId} owner={contact.owner} owners={ownerOptions} />}
        segments={detail.segments.segments.length > 0 ? <SegmentChips segments={detail.segments.segments} truncated={detail.segments.truncated} /> : null}
        actions={
          <ContactHeaderActions
            contactId={contact.id}
            displayName={displayName}
            profileUrl={profileUrl}
            platformLabel={`View on ${platformLabel(contact.platform)}`}
            conversationId={conversation?.id ?? null}
          />
        }
        figures={[
          { label: "DMs received", value: formatNumber(stats.dmsReceived) },
          { label: "Link clicks", value: formatNumber(stats.linkClicks) },
          { label: "Automation runs", value: formatNumber(stats.flowSessions) },
          { label: "Notes", value: formatNumber(stats.notes) },
          {
            label: "Last active",
            value: contact.lastInteractionAt ? (
              <time dateTime={contact.lastInteractionAt.toISOString()} title={formatAbsolute(contact.lastInteractionAt, timezone)} suppressHydrationWarning>
                {formatRelative(contact.lastInteractionAt)}
              </time>
            ) : (
              <span className="text-ink/40">None yet</span>
            ),
          },
          {
            label: "First seen",
            value: (
              <time dateTime={contact.firstSeenAt.toISOString()} title={formatAbsolute(contact.firstSeenAt, timezone)}>
                {formatDate(contact.firstSeenAt, timezone)}
              </time>
            ),
          },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ContactPipelinesCard
            contactId={contact.id}
            contactName={displayName}
            pipelines={pipelines}
            entries={detail.pipelines}
            canManagePipelines={canManageSettings(ctx.role)}
          />
          <ContactPropertiesCard contact={editable} />
          <ContactTagsCard contact={editable} allTags={tags.map((t) => t.tag)} />
          <ContactMessagingCard contact={editable}>
            <div className="divide-y">
              <Row label="Follows you">{contact.isFollower === null ? <span className="font-normal text-muted-foreground">Not known yet</span> : contact.isFollower ? "Yes" : "No"}</Row>
              <Row label="Can reply until">
                {!contact.messageable ? (
                  <span className="font-normal text-muted-foreground">After they message you</span>
                ) : conversation?.windowOpen && conversation.windowClosesAt ? (
                  <time dateTime={conversation.windowClosesAt.toISOString()} title={formatAbsolute(conversation.windowClosesAt, timezone)}>
                    {formatAbsolute(conversation.windowClosesAt, timezone)}
                  </time>
                ) : (
                  <span className="font-normal text-muted-foreground">Closed until they message you</span>
                )}
              </Row>
              {conversation ? (
                <Row label="Conversation">
                  <Link href={`/inbox?c=${encodeURIComponent(conversation.id)}`} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                    {conversation.status === "OPEN" ? "Open" : "Closed"}
                    {conversation.unreadCount > 0 ? <Badge variant="magenta">{conversation.unreadCount} unread</Badge> : null}
                  </Link>
                </Row>
              ) : null}
            </div>
          </ContactMessagingCard>
        </div>

        <ContactActivity contactId={contact.id} events={detail.timeline} timezone={timezone} viewer={{ id: ctx.user.id, role: ctx.role }} />
      </div>
    </>
  );
}
