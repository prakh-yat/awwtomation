"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import type { UpdateContactInput } from "@/lib/services/contacts";
import { cn, initials } from "@/lib/utils";

import { contactsApi, errorMessage } from "./api";
import { TagInput } from "./tag-input";

/** Serializable slice of the contact the editors need (the page derives it from ContactDetail). */
export type EditableContact = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  ownerId: string | null;
  tags: string[];
  /** Values are rendered as text; saving writes them back as strings. */
  customFields: Record<string, string>;
  optedOut: boolean;
};

export type OwnerOption = { id: string; name: string | null; email: string; avatarUrl: string | null };

const UNASSIGNED = "__unassigned__";

export function ownerLabel(owner: Pick<OwnerOption, "name" | "email">): string {
  return owner.name?.trim() || owner.email;
}

export function OwnerAvatar({ owner, className }: { owner: OwnerOption; className?: string }) {
  return (
    <Avatar className={cn("h-5 w-5", className)}>
      {owner.avatarUrl ? <AvatarImage src={owner.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="text-[9px]">{initials(owner.name ?? owner.email)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Local state that follows its prop: when the server sends a different value
 * (after `router.refresh()`), the local copy is replaced; otherwise edits stay.
 */
function useSyncedState<T>(value: T, equal: (a: T, b: T) => boolean = Object.is): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = React.useState(value);
  const [synced, setSynced] = React.useState(value);
  if (!equal(synced, value)) {
    setSynced(value);
    setState(value);
  }
  return [state, setState];
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && a[k] === b[k]);
}

function useContactPatch(contactId: string) {
  const router = useRouter();
  return React.useCallback(
    async (data: UpdateContactInput, messages: { success?: string; error: string }) => {
      try {
        await contactsApi.update(contactId, data);
        if (messages.success) toast.success(messages.success);
        router.refresh();
        return true;
      } catch (err) {
        toast.error(errorMessage(err, messages.error));
        return false;
      }
    },
    [contactId, router],
  );
}

/** A text property that saves when you leave the field or press Enter; Escape puts the saved value back. */
function InlineField({
  id,
  label,
  value,
  placeholder,
  type = "text",
  maxLength,
  onSave,
}: {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  type?: "text" | "email" | "tel";
  maxLength: number;
  onSave: (next: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useSyncedState(value ?? "");
  const [saving, setSaving] = React.useState(false);

  async function commit() {
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    setSaving(true);
    const ok = await onSave(next === "" ? null : next);
    setSaving(false);
    if (!ok) setDraft(value ?? "");
  }

  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
      <Label htmlFor={id} className="text-[13px] font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            e.currentTarget.blur();
          }
        }}
        className="h-8 border-transparent bg-transparent px-2 text-[13px] shadow-none hover:border-input focus-visible:border-foreground"
      />
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Owner and the contact details a team fills in by hand. */
export function ContactPropertiesCard({ contact, owners }: { contact: EditableContact; owners: OwnerOption[] }) {
  const patch = useContactPatch(contact.id);
  const [ownerId, setOwnerId] = useSyncedState(contact.ownerId);

  async function changeOwner(value: string) {
    const next = value === UNASSIGNED ? null : value;
    const previous = ownerId;
    setOwnerId(next);
    const owner = owners.find((o) => o.id === next);
    const ok = await patch({ ownerId: next }, { success: owner ? `Assigned to ${ownerLabel(owner)}` : "Unassigned", error: "Couldn't change the owner" });
    if (!ok) setOwnerId(previous);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <PropertyRow label="Owner">
          <Select value={ownerId ?? UNASSIGNED} onValueChange={(v) => void changeOwner(v)}>
            <SelectTrigger className="h-8 border-transparent px-2 text-[13px] shadow-none hover:border-input" aria-label="Owner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>
                <span className="text-muted-foreground">Unassigned</span>
              </SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span className="flex items-center gap-2">
                    <OwnerAvatar owner={o} />
                    {ownerLabel(o)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PropertyRow>

        <InlineField
          id="contact-name"
          label="Name"
          value={contact.name}
          placeholder={contact.username ? `@${contact.username}` : "Add a name"}
          maxLength={120}
          onSave={(name) => patch({ name }, { error: "Couldn't save the name" })}
        />
        <InlineField
          id="contact-email"
          label="Email"
          type="email"
          value={contact.email}
          placeholder="Add an email"
          maxLength={254}
          onSave={(email) => patch({ email }, { error: "Couldn't save the email" })}
        />
        <InlineField
          id="contact-phone"
          label="Phone"
          type="tel"
          value={contact.phone}
          placeholder="Add a phone number"
          maxLength={32}
          onSave={(phone) => patch({ phone }, { error: "Couldn't save the phone number" })}
        />
      </CardContent>
    </Card>
  );
}

type FieldRow = { id: number; key: string; value: string };

function toRows(fields: Record<string, string>): FieldRow[] {
  return Object.entries(fields).map(([key, value], i) => ({ id: i, key, value }));
}

/** Tags plus free-form fields such as city or size. */
export function ContactTagsCard({ contact, allTags }: { contact: EditableContact; allTags: string[] }) {
  const patch = useContactPatch(contact.id);
  const [tags, setTags] = useSyncedState(contact.tags, sameList);
  const [savingTags, setSavingTags] = React.useState(false);
  const [rows, setRows] = React.useState<FieldRow[]>(() => toRows(contact.customFields));
  const [rowsSource, setRowsSource] = React.useState(contact.customFields);
  const [savingFields, setSavingFields] = React.useState(false);
  const nextRowId = React.useRef(rows.length);

  // Saved fields changed on the server: show them, dropping any draft of the old values.
  if (!sameRecord(rowsSource, contact.customFields)) {
    setRowsSource(contact.customFields);
    setRows(toRows(contact.customFields));
  }

  async function saveTags(next: string[]) {
    const previous = tags;
    setTags(next);
    setSavingTags(true);
    const ok = await patch({ tags: next }, { error: "Couldn't update the tags" });
    setSavingTags(false);
    if (!ok) setTags(previous);
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

  async function saveFields() {
    if (fieldsInvalid) return;
    const customFields: Record<string, string> = {};
    for (const r of rows) customFields[r.key.trim()] = r.value;
    setSavingFields(true);
    await patch({ customFields }, { success: "Fields saved", error: "Couldn't save the fields" });
    setSavingFields(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Tags and fields</CardTitle>
        <CardDescription>Tags decide who gets a broadcast. Automations can add them too.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="contact-tags" className="text-[13px]">
              Tags
            </Label>
            {savingTags ? <span className="text-[11px] text-muted-foreground">Saving…</span> : null}
          </div>
          <TagInput id="contact-tags" value={tags} onChange={(next) => void saveTags(next)} suggestions={allTags} disabled={savingTags} placeholder="Add a tag and press Enter" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[13px]">Fields</Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRows((prev) => [...prev, { id: nextRowId.current++, key: "", value: "" }])}>
              <Plus />
              Add field
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing yet. Keep things like their city, size or order number here.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const key = row.key.trim();
                const invalid = !key || duplicateKeys.has(key);
                return (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r)))}
                      placeholder="Field"
                      maxLength={64}
                      aria-label="Field name"
                      aria-invalid={invalid || undefined}
                      className="h-8 w-2/5 text-[13px]"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))}
                      placeholder="Value"
                      maxLength={1000}
                      aria-label="Field value"
                      className="h-8 flex-1 text-[13px]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                      aria-label="Remove field"
                    >
                      <X />
                    </Button>
                  </div>
                );
              })}
              {duplicateKeys.size > 0 ? <p className="text-xs text-destructive">Each field needs a different name.</p> : null}
              {emptyKeys ? <p className="text-xs text-destructive">Every field needs a name.</p> : null}
            </div>
          )}
          {fieldsDirty ? (
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setRows(toRows(contact.customFields))} disabled={savingFields}>
                Discard
              </Button>
              <Button type="button" size="sm" onClick={() => void saveFields()} loading={savingFields} disabled={fieldsInvalid}>
                Save fields
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Whether automations, broadcasts and replies may reach this person. */
export function ContactMessagingCard({ contact, children }: { contact: EditableContact; children?: React.ReactNode }) {
  const patch = useContactPatch(contact.id);
  const [optedOut, setOptedOut] = useSyncedState(contact.optedOut);
  const [saving, setSaving] = React.useState(false);

  async function toggle(next: boolean) {
    const previous = optedOut;
    setOptedOut(next);
    setSaving(true);
    const ok = await patch(
      { optedOut: next },
      { success: next ? "Messages to this contact are now blocked" : "This contact can receive messages again", error: "Couldn't change this setting" },
    );
    setSaving(false);
    if (!ok) setOptedOut(previous);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Messaging</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="flex items-start justify-between gap-4 border-t pt-4">
          <div className="space-y-1">
            <Label htmlFor="contact-opted-out" className="text-[13px]">
              Stop all messages
            </Label>
            <p className="text-xs text-muted-foreground">Automations, broadcasts and Inbox replies skip this person. Use it when someone asks you to stop.</p>
          </div>
          <Switch id="contact-opted-out" checked={optedOut} onCheckedChange={(v) => void toggle(v)} disabled={saving} />
        </div>
      </CardContent>
    </Card>
  );
}
