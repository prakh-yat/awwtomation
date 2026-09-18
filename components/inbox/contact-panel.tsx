"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Workflow, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { toast } from "@/components/ui/sonner";
import type { ConversationDetail, FlowSessionSummary } from "@/lib/services/inbox";
import { cn, initials } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { contactDisplayName, contactHandle, formatDateTime, relativeAgo, userDisplayName } from "./format";

const MAX_TAG_LENGTH = 64;

/** "delivery_city" reads as "Delivery city"; the key itself stays editable on the contact page. */
function fieldLabel(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function sessionBadge(status: FlowSessionSummary["status"]): { label: string; variant: "success" | "warning" | "secondary" } {
  switch (status) {
    case "ACTIVE":
      return { label: "In progress", variant: "warning" };
    case "COMPLETED":
      return { label: "Completed", variant: "success" };
    case "EXPIRED":
      return { label: "Expired", variant: "secondary" };
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
        <span key={tag} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs">
          {tag}
          <button
            type="button"
            onClick={() => void save(tags.filter((t) => t !== tag))}
            disabled={saving}
            className="rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50"
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
          className="h-6 w-28 px-2 text-xs"
          aria-label="New tag"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
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

/** Right-hand pane: who you're talking to, their tags/fields and recent automation activity. */
function ContactPanel({ conversation, now, onTagsChange, className }: ContactPanelProps) {
  const { contact, channel } = conversation;
  const name = contactDisplayName(contact);
  const handle = contactHandle(contact);
  const fields = Object.entries(contact.customFields);

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-y-auto scrollbar-thin", className)} aria-label="Contact details">
      <div className="flex flex-col items-center border-b px-5 py-6 text-center">
        <Avatar className="h-14 w-14">
          {contact.avatarUrl ? <AvatarImage src={contact.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-sm">{initials(contact.name ?? contact.username)}</AvatarFallback>
        </Avatar>
        <p className="mt-3 text-sm font-semibold">{name}</p>
        {handle && handle !== name ? <p className="text-xs text-muted-foreground">{handle}</p> : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <Badge variant="outline">
            <PlatformIcon platform={channel.platform} size={11} />
            {channel.username ? `@${channel.username}` : channel.name ?? channel.platform.toLowerCase()}
          </Badge>
          {contact.isFollower === true ? <Badge variant="success">Follower</Badge> : null}
          {contact.isFollower === false ? <Badge variant="secondary">Not following</Badge> : null}
          {contact.optedOut ? <Badge variant="destructive">Opted out</Badge> : null}
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href={`/contacts/${contact.id}`}>
            View contact
            <ArrowUpRight />
          </Link>
        </Button>
      </div>

      <div className="space-y-6 px-5 py-5">
        <Section title="Tags">
          <TagEditor contactId={contact.id} tags={contact.tags} onSaved={onTagsChange} />
        </Section>

        {fields.length > 0 ? (
          <Section title="Custom fields">
            <dl className="space-y-1.5">
              {fields.map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="shrink-0 text-muted-foreground">{fieldLabel(key)}</dt>
                  <dd className="truncate text-right font-medium" title={formatFieldValue(value)}>
                    {formatFieldValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        <Section title="Recent automations">
          {conversation.recentSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No automations have run for this contact yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {conversation.recentSessions.map((session) => {
                const badge = sessionBadge(session.status);
                return (
                  <li key={session.id}>
                    <Link
                      href={`/automations/${session.automation.id}`}
                      className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors hover:bg-accent"
                    >
                      <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{session.automation.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{relativeAgo(session.updatedAt, now)}</span>
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Details">
          <dl className="space-y-1.5 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Assigned to</dt>
              <dd className="truncate font-medium">{conversation.assignedTo ? userDisplayName(conversation.assignedTo) : "Unassigned"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">First seen</dt>
              <dd className="font-medium" title={formatDateTime(contact.firstSeenAt)}>
                {relativeAgo(contact.firstSeenAt, now)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Last active</dt>
              <dd className="font-medium">{contact.lastInteractionAt ? relativeAgo(contact.lastInteractionAt, now) : "–"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{conversation.status === "OPEN" ? "Open" : "Closed"}</dd>
            </div>
          </dl>
        </Section>
      </div>
    </aside>
  );
}

export { ContactPanel };
