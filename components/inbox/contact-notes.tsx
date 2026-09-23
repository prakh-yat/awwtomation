"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import type { ContactNoteSummary } from "@/lib/services/contact-notes";

import { apiFetch, errorMessage } from "./api";
import { relativeAgo, userDisplayName } from "./format";

// Mirrors NOTE_MAX_LENGTH in lib/services/contact-notes.ts (server-only module).
const NOTE_MAX_LENGTH = 4000;
/** The panel shows the latest few; the contact page has the rest. */
const NOTES_SHOWN = 3;

/**
 * The team's latest notes on this contact and a box to add one, backed by
 * `/api/contacts/[id]/notes`. The parent keys it by contact id, so switching
 * threads starts clean.
 */
function ContactNotes({ contactId, now }: { contactId: string; now: number }) {
  const [notes, setNotes] = React.useState<ContactNoteSummary[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    apiFetch<{ notes: ContactNoteSummary[] }>(`/api/contacts/${encodeURIComponent(contactId)}/notes?limit=${NOTES_SHOWN}`)
      .then((res) => {
        if (!cancelled) setNotes(res.notes);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  async function save() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const { note } = await apiFetch<{ note: ContactNoteSummary }>(`/api/contacts/${encodeURIComponent(contactId)}/notes`, {
        method: "POST",
        json: { body },
      });
      setNotes((prev) => [note, ...(prev ?? [])].slice(0, NOTES_SHOWN));
      setDraft("");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the note"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Add a note for your team"
          aria-label="New note"
          className="min-h-0 resize-none text-[13px]"
        />
        {draft.trim() ? (
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" loading={saving}>
              Save note
            </Button>
          </div>
        ) : null}
      </form>

      {notes === null && !failed ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
      {failed ? <p className="text-[13px] text-muted-foreground">{"Couldn't load notes."}</p> : null}

      {notes?.map((note) => (
        <article key={note.id} className="rounded-xl bg-fog px-3 py-2.5">
          <p className="line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">{note.body}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {note.author ? `${userDisplayName(note.author)} · ` : ""}
            {relativeAgo(note.createdAt, now)}
          </p>
        </article>
      ))}

      {notes && notes.length >= NOTES_SHOWN ? (
        <Link
          href={`/contacts/${contactId}`}
          className="inline-block rounded text-[12px] font-semibold text-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          All notes
        </Link>
      ) : null}
    </div>
  );
}

export { ContactNotes };
