"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";

import { contactsApi, errorMessage } from "./api";
import { TagInput } from "./tag-input";

/** Serializable slice of the contact the editor needs (the page derives it from ContactDetail). */
export type EditableContact = {
  id: string;
  name: string | null;
  username: string | null;
  tags: string[];
  /** Values are rendered as text; saving writes them back as strings. */
  customFields: Record<string, string>;
  optedOut: boolean;
};

export interface ContactDetailsCardProps {
  contact: EditableContact;
  /** Workspace tags for autocomplete. */
  allTags: string[];
}

type FieldRow = { id: number; key: string; value: string };

function toRows(fields: Record<string, string>): FieldRow[] {
  return Object.entries(fields).map(([key, value], i) => ({ id: i, key, value }));
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && a[k] === b[k]);
}

function ContactDetailsCard({ contact, allTags }: ContactDetailsCardProps) {
  const router = useRouter();

  const [name, setName] = React.useState(contact.name ?? "");
  const [savingName, setSavingName] = React.useState(false);

  const [tags, setTags] = React.useState(contact.tags);
  const [savingTags, setSavingTags] = React.useState(false);

  const [rows, setRows] = React.useState<FieldRow[]>(() => toRows(contact.customFields));
  const [savingFields, setSavingFields] = React.useState(false);
  const nextRowId = React.useRef(rows.length);

  const [optedOut, setOptedOut] = React.useState(contact.optedOut);
  const [savingOptOut, setSavingOptOut] = React.useState(false);

  // After router.refresh() the server hands us a fresh `contact`. Re-sync only
  // the fields that actually changed so an in-progress edit elsewhere on the
  // card (say, a half-typed name) survives saving the opt-out switch.
  const previous = React.useRef(contact);
  React.useEffect(() => {
    const prev = previous.current;
    if (prev === contact) return;
    if (prev.name !== contact.name) setName(contact.name ?? "");
    if (!sameList(prev.tags, contact.tags)) setTags(contact.tags);
    if (!sameRecord(prev.customFields, contact.customFields)) setRows(toRows(contact.customFields));
    if (prev.optedOut !== contact.optedOut) setOptedOut(contact.optedOut);
    previous.current = contact;
  }, [contact]);

  const nameDirty = name.trim() !== (contact.name ?? "").trim();

  async function saveName() {
    if (!nameDirty) return;
    setSavingName(true);
    try {
      await contactsApi.update(contact.id, { name: name.trim() || null });
      toast.success("Name updated");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update name"));
    } finally {
      setSavingName(false);
    }
  }

  async function saveTags(next: string[]) {
    const previous = tags;
    setTags(next);
    setSavingTags(true);
    try {
      await contactsApi.update(contact.id, { tags: next });
      router.refresh();
    } catch (err) {
      setTags(previous);
      toast.error(errorMessage(err, "Couldn't update tags"));
    } finally {
      setSavingTags(false);
    }
  }

  const fieldsDirty = React.useMemo(() => {
    const current = Object.entries(contact.customFields);
    const draft = rows.map((r) => [r.key.trim(), r.value] as const);
    if (current.length !== draft.length) return true;
    return draft.some(([k, v], i) => current[i]?.[0] !== k || current[i]?.[1] !== v);
  }, [contact.customFields, rows]);

  const duplicateKeys = React.useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      if (seen.has(k)) dupes.add(k);
      seen.add(k);
    }
    return dupes;
  }, [rows]);

  const emptyKeys = rows.some((r) => !r.key.trim());
  const fieldsInvalid = duplicateKeys.size > 0 || emptyKeys;

  function addRow() {
    setRows((prev) => [...prev, { id: nextRowId.current++, key: "", value: "" }]);
  }

  function updateRow(id: number, patch: Partial<Pick<FieldRow, "key" | "value">>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveFields() {
    if (fieldsInvalid) return;
    const customFields: Record<string, string> = {};
    for (const r of rows) customFields[r.key.trim()] = r.value;
    setSavingFields(true);
    try {
      await contactsApi.update(contact.id, { customFields });
      toast.success("Custom fields saved");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save custom fields"));
    } finally {
      setSavingFields(false);
    }
  }

  async function toggleOptOut(next: boolean) {
    const previous = optedOut;
    setOptedOut(next);
    setSavingOptOut(true);
    try {
      await contactsApi.update(contact.id, { optedOut: next });
      toast.success(next ? "Contact opted out — no more messages will be sent" : "Contact can receive messages again");
      router.refresh();
    } catch (err) {
      setOptedOut(previous);
      toast.error(errorMessage(err, "Couldn't update messaging preference"));
    } finally {
      setSavingOptOut(false);
    }
  }

  async function deleteContact() {
    try {
      await contactsApi.remove(contact.id);
      toast.success("Contact deleted");
      router.push("/contacts");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete contact"));
      throw err;
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Edits apply immediately and are visible in the Inbox and in flows via {"{{name}}"}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Name</Label>
            <div className="flex gap-2">
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                }}
                placeholder={contact.username ? `@${contact.username}` : "Unknown"}
                maxLength={120}
                className="h-9"
              />
              {nameDirty ? (
                <Button type="button" onClick={saveName} loading={savingName} size="default">
                  Save
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="contact-tags">Tags</Label>
              {savingTags ? <span className="text-[11px] text-muted-foreground">Saving…</span> : null}
            </div>
            <TagInput id="contact-tags" value={tags} onChange={(next) => void saveTags(next)} suggestions={allTags} disabled={savingTags} placeholder="Add a tag and press Enter" />
            <p className="text-xs text-muted-foreground">Tags drive broadcast audiences and can be set by a flow&rsquo;s Tag step.</p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Custom fields</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addRow}>
                <Plus />
                Add field
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                No custom fields. Store anything you&rsquo;d like to remember about this person — email, order id, city.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => {
                  const key = row.key.trim();
                  const invalid = (key && duplicateKeys.has(key)) || !key;
                  return (
                    <div key={row.id} className="flex items-center gap-2">
                      <Input
                        value={row.key}
                        onChange={(e) => updateRow(row.id, { key: e.target.value })}
                        placeholder="Field"
                        maxLength={64}
                        aria-label="Field name"
                        aria-invalid={invalid || undefined}
                        className="h-8 w-2/5 font-mono text-[12px]"
                      />
                      <Input
                        value={row.value}
                        onChange={(e) => updateRow(row.id, { value: e.target.value })}
                        placeholder="Value"
                        maxLength={1000}
                        aria-label="Field value"
                        className="h-8 flex-1 text-[13px]"
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => removeRow(row.id)} aria-label="Remove field">
                        <X />
                      </Button>
                    </div>
                  );
                })}
                {duplicateKeys.size > 0 ? <p className="text-xs text-destructive">Field names must be unique.</p> : null}
                {emptyKeys ? <p className="text-xs text-destructive">Every field needs a name.</p> : null}
              </div>
            )}
            {fieldsDirty ? (
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setRows(toRows(contact.customFields))} disabled={savingFields}>
                  Discard
                </Button>
                <Button type="button" size="sm" onClick={saveFields} loading={savingFields} disabled={fieldsInvalid}>
                  Save fields
                </Button>
              </div>
            ) : null}
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="contact-opted-out">Opted out of messages</Label>
              <p className="text-xs text-muted-foreground">
                When on, nothing is sent to this contact — automations, broadcasts and Inbox replies are all skipped and logged as
                &ldquo;opted out&rdquo;. Turn it on when someone asks you to stop messaging them.
              </p>
            </div>
            <Switch id="contact-opted-out" checked={optedOut} onCheckedChange={(v) => void toggleOptOut(v)} disabled={savingOptOut} aria-label="Opted out of messages" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Deleting removes the conversation and flow history. Delivery logs stay for reporting.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive">
                <Trash2 />
                Delete contact
              </Button>
            }
            title="Delete this contact?"
            description="Their conversation, messages and flow progress are permanently removed. If they interact again, a fresh contact is created without tags or fields."
            confirmLabel="Delete contact"
            destructive
            onConfirm={deleteContact}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export { ContactDetailsCard };
