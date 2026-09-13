"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import type { ContactChannelSummary } from "@/lib/services/contacts";
import type { PipelineSummary } from "@/lib/services/pipelines";

import { contactsApi, errorMessage } from "./api";
import { PipelineStageFields } from "./pipeline-stage-fields";
import { TagInput } from "./tag-input";

function accountLabel(c: Pick<ContactChannelSummary, "username" | "name" | "platform">): string {
  if (c.username) return `@${c.username.replace(/^@/, "")}`;
  return c.name ?? (c.platform === "INSTAGRAM" ? "Instagram account" : "Facebook Page");
}

export function AddContactDialog({
  open,
  onOpenChange,
  channels,
  pipelines,
  defaultPipelineId,
  defaultStageId,
  allTags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: ContactChannelSummary[];
  pipelines: PipelineSummary[];
  /** The pipeline being viewed; new contacts start there. */
  defaultPipelineId: string | null;
  defaultStageId: string | null;
  allTags: string[];
}) {
  const router = useRouter();
  const [channelId, setChannelId] = React.useState(channels[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [place, setPlace] = React.useState({ pipelineId: "", stageId: "" });
  const [tags, setTags] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChannelId(channels[0]?.id ?? "");
      setName("");
      setUsername("");
      setEmail("");
      setPhone("");
      const startPipeline = pipelines.find((p) => p.id === defaultPipelineId);
      const startStage = startPipeline?.stages.find((s) => s.id === defaultStageId) ?? startPipeline?.stages[0];
      setPlace(startPipeline && startStage ? { pipelineId: startPipeline.id, stageId: startStage.id } : { pipelineId: "", stageId: "" });
      setTags([]);
    }
  }

  const channel = channels.find((c) => c.id === channelId);
  const handleLabel = channel?.platform === "FACEBOOK" ? "Facebook username" : "Instagram username";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !channelId) return;
    setSaving(true);
    try {
      const created = await contactsApi.create({
        channelId,
        name: name.trim(),
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        ...(place.pipelineId && place.stageId ? { pipelineId: place.pipelineId, stageId: place.stageId } : {}),
        tags: tags.length ? tags : undefined,
      });
      toast.success(`Added ${name.trim()}`);
      onOpenChange(false);
      router.push(`/contacts/${created.id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add the contact"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add a contact</DialogTitle>
            <DialogDescription>
              For someone you know from outside Instagram or Facebook. Add their username and they join this record the first time they comment or message you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-contact-name">Name</Label>
              <Input id="add-contact-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus required />
            </div>

            {channels.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="add-contact-account">Account</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger id="add-contact-account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <PlatformIcon platform={c.platform} size={13} className="text-muted-foreground" />
                          {accountLabel(c)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="add-contact-username">{handleLabel}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                <Input id="add-contact-username" value={username} onChange={(e) => setUsername(e.target.value.replace(/^@+/, ""))} maxLength={64} className="pl-7" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-contact-email">Email</Label>
                <Input id="add-contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-contact-phone">Phone</Label>
                <Input id="add-contact-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} />
              </div>
            </div>

            {pipelines.length > 0 ? <PipelineStageFields idPrefix="add-contact" pipelines={pipelines} value={place} onChange={setPlace} /> : null}

            <div className="space-y-1.5">
              <Label htmlFor="add-contact-tags">Tags</Label>
              <TagInput id="add-contact-tags" value={tags} onChange={setTags} suggestions={allTags} placeholder="Add a tag and press Enter" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!name.trim() || !channelId}>
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
