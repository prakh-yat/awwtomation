"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Workflow, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORM_TONE, PlatformMark } from "@/components/ui/platform-badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { toast } from "@/components/ui/sonner";
import { TONES } from "@/components/ui/tone";
import type { ConversationDetail, FlowSessionSummary } from "@/lib/services/inbox";
import { cn, initials } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { ContactNotes } from "./contact-notes";
import { contactDisplayName, contactHandle, formatDateTime, relativeAgo, userDisplayName } from "./format";
import { tagTone } from "./tag-tone";

const MAX_TAG_LENGTH = 64;

/** "delivery_city" reads as "Delivery city"; the key itself stays editable on the contact page. */
function fieldLabel(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="brand-label text-mute">{title}</h3>
      {children}
    </section>
  );
}

function sessionBadge(status: FlowSessionSummary["status"]): { label: string; variant: BadgeVariant; live: boolean } {
  switch (status) {
    case "ACTIVE":
      return { label: "In progress", variant: "blue", live: true };
    case "COMPLETED":
      return { label: "Completed", variant: "success", live: false };
    case "EXPIRED":
      return { label: "Expired", variant: "secondary", live: false };
  }
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[unreadable]";
  }
}

function DetailRow({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-ink" title={title}>
        {children}
      </dd>
    </div>
  );
}

/**
 * Tag chips backed by the contacts lane's `PATCH /api/contacts/[id] { tags: string[] }`.
 * Optimistic: the chip list updates immediately and rolls back on failure.
 */
function TagEditor({ contactId, tags, onSaved }: { contactId: string; tags: string[]; onSaved: (tags: string[]) => void }) {
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function save(next: string[]) {
    const previous = tags;
    onSaved(next);
    setSaving(true);
    try {
      await apiFetch(`/api/contacts/${encodeURIComponent(contactId)}`, { method: "PATCH", json: { tags: next } });
      toast.success("Tags updated");
    } catch (err) {
      onSaved(previous);
      toast.error(errorMessage(err, "Couldn't update tags"));
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const tag = draft.trim().slice(0, MAX_TAG_LENGTH);
    setDraft("");
    setAdding(false);
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    void save([...tags, tag]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn("inline-flex max-w-full items-center gap-0.5 rounded-full py-0.5 pl-2.5 pr-1 text-[12px] font-semibold", TONES[tagTone(tag)].soft)}
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={() => void save(tags.filter((t) => t !== tag))}
            disabled={saving}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            } else if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          onBlur={addTag}
          maxLength={MAX_TAG_LENGTH}
          placeholder="Tag name"
          className="h-6 w-28 rounded-full px-2.5 text-[12px]"
          aria-label="New tag"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={saving}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Add tag
        </button>
      )}
    </div>
  );
}

export type ContactPanelProps = {
  conversation: ConversationDetail;
  now: number;
  onTagsChange: (tags: string[]) => void;
  className?: string;
};

/** Right-hand pane: who you're talking to, their tags, notes and fields, and recent automation activity. */
function ContactPanel({ conversation, now, onTagsChange, className }: ContactPanelProps) {
  const { contact, channel } = conversation;
  const name = contactDisplayName(contact);
  const handle = contactHandle(contact);
  const fields = Object.entries(contact.customFields);
  const account = channel.username ? `@${channel.username}` : (channel.name ?? PLATFORM_TONE[channel.platform].label);

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-y-auto bg-background scrollbar-thin", className)} aria-label="Contact details">
      <div className="flex flex-col items-center px-5 pb-5 pt-7 text-center">
        <span className="relative">
          <Avatar className="h-16 w-16" aria-hidden>
            {contact.avatarUrl ? <AvatarImage src={contact.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-base">{initials(contact.name ?? contact.username)}</AvatarFallback>
          </Avatar>
          <PlatformMark platform={channel.platform} size={22} className="absolute -bottom-0.5 -right-0.5 ring-[3px] ring-background" />
        </span>
        <p className="mt-3 max-w-full truncate text-[16px] font-semibold leading-tight text-ink">{name}</p>
        {handle && handle !== name ? <p className="mt-0.5 max-w-full truncate text-[13px] text-muted-foreground">{handle}</p> : null}

        <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-1.5">
          <span
            className={cn("inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-semibold", PLATFORM_TONE[channel.platform].soft)}
          >
            <PlatformIcon platform={channel.platform} size={11} />
            <span className="truncate">{account}</span>
          </span>
          {contact.isFollower === true ? <Badge variant="success">Follows you</Badge> : null}
          {contact.isFollower === false ? <Badge variant="secondary">{"Doesn't follow you"}</Badge> : null}
          {contact.optedOut ? <Badge variant="destructive">Opted out</Badge> : null}
        </div>

        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href={`/contacts/${contact.id}`}>
            View contact
            <ArrowUpRight />
          </Link>
        </Button>
      </div>

      <div className="space-y-6 border-t px-5 py-5">
        <Section title="Tags">
          <TagEditor contactId={contact.id} tags={contact.tags} onSaved={onTagsChange} />
        </Section>

        <Section title="Notes">
          <ContactNotes key={contact.id} contactId={contact.id} now={now} />
        </Section>

        <Section title="Recent automations">
          {conversation.recentSessions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">None yet.</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {conversation.recentSessions.map((session) => {
                const badge = sessionBadge(session.status);
                return (
                  <li key={session.id}>
                    <Link
                      href={`/automations/${session.automation.id}`}
                      className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-soft text-purple-ink">
                        <Workflow className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">{session.automation.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{relativeAgo(session.updatedAt, now)}</span>
                      </span>
                      <Badge variant={badge.variant} dot={badge.live ? "pulse" : undefined}>
                        {badge.label}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {fields.length > 0 ? (
          <Section title="Custom fields">
            <dl>
              {fields.map(([key, value]) => (
                <DetailRow key={key} label={fieldLabel(key)} title={formatFieldValue(value)}>
                  {formatFieldValue(value)}
                </DetailRow>
              ))}
            </dl>
          </Section>
        ) : null}

        <Section title="Details">
          <dl>
            <DetailRow label="Assigned to">{conversation.assignedTo ? userDisplayName(conversation.assignedTo) : "Unassigned"}</DetailRow>
            <DetailRow label="First seen" title={formatDateTime(contact.firstSeenAt)}>
              {relativeAgo(contact.firstSeenAt, now)}
            </DetailRow>
            <DetailRow label="Last active">{contact.lastInteractionAt ? relativeAgo(contact.lastInteractionAt, now) : "–"}</DetailRow>
            <DetailRow label="Status">{conversation.status === "OPEN" ? "Open" : "Closed"}</DetailRow>
          </dl>
        </Section>
      </div>
    </aside>
  );
}

export { ContactPanel };
