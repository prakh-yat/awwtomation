"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { ArrowRightLeft, MessageSquare, MousePointerClick, Reply, Send, StickyNote, Workflow, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import type { ContactTimelineEvent, ContactTimelineKind } from "@/lib/services/contacts";
import { cn } from "@/lib/utils";

import { contactsApi, errorMessage } from "./api";
import { formatAbsolute, formatRelative } from "./format";

const NOTE_MAX = 4000;

const ICONS: Record<ContactTimelineKind, LucideIcon> = {
  note: StickyNote,
  message_in: MessageSquare,
  message_out: Reply,
  dm: Send,
  public_reply: Reply,
  automation: Workflow,
  click: MousePointerClick,
  stage: ArrowRightLeft,
};

const TONE_DOT: Record<ContactTimelineEvent["tone"], string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  neutral: "bg-transparent",
};

type Filter = "all" | "notes" | "messages" | "automations" | "stage";

const FILTERS: Array<{ value: Filter; label: string; kinds: ContactTimelineKind[] | null }> = [
  { value: "all", label: "All", kinds: null },
  { value: "notes", label: "Notes", kinds: ["note"] },
  { value: "messages", label: "Messages", kinds: ["message_in", "message_out", "dm", "public_reply"] },
  { value: "automations", label: "Automations", kinds: ["automation", "click"] },
  { value: "stage", label: "Stage", kinds: ["stage"] },
];

export type ActivityViewer = { id: string; role: WorkspaceRole };

function canEdit(event: ContactTimelineEvent, viewer: ActivityViewer): boolean {
  if (!event.note) return false;
  return event.note.author?.id === viewer.id || viewer.role === "ADMIN" || viewer.role === "OWNER";
}

function NoteComposer({ contactId, onAdded }: { contactId: string; onAdded: () => void }) {
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await contactsApi.addNote(contactId, text);
      setBody("");
      onAdded();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the note"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-background focus-within:border-foreground/40">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        maxLength={NOTE_MAX}
        rows={3}
        placeholder="Add a note for your team"
        aria-label="New note"
        className="min-h-[76px] resize-none border-0 shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between border-t px-3 py-2">
        <span className="text-[11px] text-muted-foreground">Only your team sees notes.</span>
        <Button size="sm" onClick={() => void save()} disabled={!body.trim()} loading={saving}>
          Save note
        </Button>
      </div>
    </div>
  );
}

function NoteBody({ event, contactId, editable, onChanged }: { event: ContactTimelineEvent; contactId: string; editable: boolean; onChanged: () => void }) {
  const note = event.note;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(note?.body ?? "");
  const [busy, setBusy] = React.useState(false);

  if (!note) return null;

  async function save() {
    const text = draft.trim();
    if (!note || !text) return;
    setBusy(true);
    try {
      await contactsApi.updateNote(contactId, note.id, text);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the note"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!note) return;
    setBusy(true);
    try {
      await contactsApi.deleteNote(contactId, note.id);
      toast.success("Note deleted");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the note"));
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={NOTE_MAX} rows={3} aria-label="Edit note" className="text-[13px]" autoFocus />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(note.body);
              setEditing(false);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} loading={busy} disabled={!draft.trim()}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5 rounded-md bg-muted/50 px-3 py-2">
      <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{note.body}</p>
      {editable ? (
        <div className="mt-1.5 flex gap-3 text-xs">
          <button type="button" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </button>
          <button type="button" className="text-muted-foreground underline-offset-4 hover:text-destructive hover:underline" onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Notes composer and the merged activity feed for one contact. */
export function ContactActivity({
  contactId,
  events,
  timezone,
  viewer,
}: {
  contactId: string;
  events: ContactTimelineEvent[];
  timezone: string;
  viewer: ActivityViewer;
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("all");
  const active = FILTERS.find((f) => f.value === filter) ?? FILTERS[0];
  const visible = active.kinds ? events.filter((e) => active.kinds?.includes(e.kind)) : events;
  const refresh = React.useCallback(() => router.refresh(), [router]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Notes and activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <NoteComposer contactId={contactId} onAdded={refresh} />

        <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const selected = f.value === filter;
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "h-7 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            {filter === "notes" ? "No notes yet." : filter === "all" ? "Nothing has happened with this contact yet." : "Nothing here yet."}
          </p>
        ) : (
          <ol>
            {visible.map((event, i) => {
              const Icon = ICONS[event.kind];
              const last = i === visible.length - 1;
              return (
                <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {!last ? <span aria-hidden className="absolute bottom-0 left-[13px] top-8 w-px bg-border" /> : null}
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    {event.tone !== "neutral" ? (
                      <span aria-hidden className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background", TONE_DOT[event.tone])} />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] leading-5">
                        {event.href ? (
                          <Link href={event.href} className="font-medium underline-offset-4 hover:underline">
                            {event.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{event.title}</span>
                        )}
                        {event.badge ? (
                          <Badge variant={event.badge.variant} className="ml-2 align-middle">
                            {event.badge.label}
                          </Badge>
                        ) : null}
                      </p>
                      <time
                        dateTime={event.at}
                        title={formatAbsolute(event.at, timezone)}
                        className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] text-muted-foreground"
                        suppressHydrationWarning
                      >
                        {formatRelative(event.at)}
                      </time>
                    </div>
                    {event.kind === "note" ? (
                      <NoteBody event={event} contactId={contactId} editable={canEdit(event, viewer)} onChanged={refresh} />
                    ) : event.detail ? (
                      <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">{event.detail}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
