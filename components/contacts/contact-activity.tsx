"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { Activity, ArrowRightLeft, Lock, MessageSquare, MousePointerClick, Reply, Send, StickyNote, Workflow, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { TONES, type Tone } from "@/components/ui/tone";
import type { ContactTimelineEvent, ContactTimelineKind } from "@/lib/services/contacts";
import { cn } from "@/lib/utils";

import { contactsApi, errorMessage } from "./api";
import { formatAbsolute, formatRelative } from "./format";
import { Panel } from "./panel";
import { riseStyle } from "./rise";

const NOTE_MAX = 4000;

/** Each kind of event wears the colour of the part of the product it came from. */
const KINDS: Record<ContactTimelineKind, { icon: LucideIcon; tone: Tone }> = {
  note: { icon: StickyNote, tone: "yellow" },
  message_in: { icon: MessageSquare, tone: "magenta" },
  message_out: { icon: Reply, tone: "magenta" },
  dm: { icon: Send, tone: "indigo" },
  public_reply: { icon: Reply, tone: "lavender" },
  automation: { icon: Workflow, tone: "purple" },
  click: { icon: MousePointerClick, tone: "sky" },
  stage: { icon: ArrowRightLeft, tone: "blue" },
};

/** Sent, not sent or failed, pinned to the marker's corner. */
const STATUS_DOT: Record<ContactTimelineEvent["tone"], string> = {
  ok: "bg-green",
  warn: "bg-orange",
  error: "bg-destructive",
  neutral: "",
};

type Filter = "all" | "notes" | "messages" | "automations" | "stage";

const FILTERS: Array<{ value: Filter; label: string; kinds: ContactTimelineKind[] | null; icon: LucideIcon; tone: Tone }> = [
  { value: "all", label: "All", kinds: null, icon: Activity, tone: "green" },
  { value: "notes", label: "Notes", kinds: ["note"], icon: StickyNote, tone: "yellow" },
  { value: "messages", label: "Messages", kinds: ["message_in", "message_out", "dm", "public_reply"], icon: MessageSquare, tone: "magenta" },
  { value: "automations", label: "Automations", kinds: ["automation", "click"], icon: Workflow, tone: "purple" },
  { value: "stage", label: "Stage", kinds: ["stage"], icon: ArrowRightLeft, tone: "blue" },
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
    <div className="rounded-2xl border bg-background transition-[border-color,box-shadow] duration-150 focus-within:border-ink focus-within:ring-4 focus-within:ring-ring/15">
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
        className="min-h-[84px] resize-none rounded-2xl border-0 bg-transparent px-4 pt-3 focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
        <span className="flex items-center gap-1.5 pl-1 text-[12px] text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden />
          Only your team sees notes
        </span>
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
    <div className={cn("mt-2 rounded-xl bg-yellow-soft px-3.5 py-2.5 transition-opacity", busy && "opacity-60")}>
      <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">{note.body}</p>
      {editable ? (
        <div className="mt-2 flex gap-3 text-[12px] font-semibold">
          <button type="button" className="text-ink/55 underline-offset-4 transition-colors hover:text-ink hover:underline" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </button>
          <button type="button" className="text-ink/55 underline-offset-4 transition-colors hover:text-destructive hover:underline" onClick={() => void remove()} disabled={busy}>
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
  const counts = React.useMemo(() => {
    const out: Record<Filter, number> = { all: events.length, notes: 0, messages: 0, automations: 0, stage: 0 };
    for (const f of FILTERS) if (f.kinds) out[f.value] = events.filter((e) => f.kinds?.includes(e.kind)).length;
    return out;
  }, [events]);

  return (
    <Panel label="Activity">
      <NoteComposer contactId={contactId} onAdded={refresh} />

      <div role="tablist" aria-label="Show" className="mt-5 flex flex-wrap gap-1.5">
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
                "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-ink text-white" : "bg-fog text-muted-foreground hover:text-ink",
              )}
            >
              {f.kinds ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", TONES[f.tone].dot)} /> : null}
              {f.label}
              <span className={cn("font-medium tabular-nums", selected ? "text-white/60" : "text-muted-foreground/80")}>{counts[f.value]}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          compact
          className="mt-5"
          tone={active.tone}
          icon={active.icon}
          title={filter === "notes" ? "No notes yet" : filter === "all" ? "Nothing has happened with this contact yet" : "Nothing here yet"}
        />
      ) : (
        <ol className="mt-6">
          {visible.map((event, i) => {
            const kind = KINDS[event.kind];
            const Icon = kind.icon;
            const last = i === visible.length - 1;
            return (
              <li key={event.id} className="rise relative flex gap-3.5 pb-6 last:pb-0" style={riseStyle(i)}>
                {!last ? <span aria-hidden className="absolute bottom-0 left-[15px] top-10 w-px bg-border" /> : null}
                <span className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", TONES[kind.tone].solid)}>
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {event.tone !== "neutral" ? (
                    <span aria-hidden className={cn("absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background", STATUS_DOT[event.tone])} />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-[13px] leading-5">
                      {event.href ? (
                        <Link href={event.href} className="font-semibold underline-offset-4 hover:underline">
                          {event.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{event.title}</span>
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
                    <p className="mt-0.5 line-clamp-2 break-words text-[12px] text-muted-foreground">{event.detail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
