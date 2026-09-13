"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import type { TrackedLinkListItem } from "@/lib/services/links";

import { errorMessage, linksApi } from "./api";

const LABEL_MAX = 80;

export type LinkFormMode = { kind: "create" } | { kind: "edit"; link: TrackedLinkListItem };

export interface LinkFormDialogProps {
  open: boolean;
  mode: LinkFormMode;
  onOpenChange: (open: boolean) => void;
  onSaved: (link: TrackedLinkListItem, mode: LinkFormMode["kind"]) => void;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Create and edit share one form. After a create the dialog stays open to
 * show the short URL with a copy button — that URL is the whole point, and
 * making people hunt for it in the table afterwards would be unkind.
 */
export function LinkFormDialog({ open, mode, onOpenChange, onSaved }: LinkFormDialogProps) {
  const editing = mode.kind === "edit" ? mode.link : null;
  const [destinationUrl, setDestinationUrl] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [created, setCreated] = React.useState<TrackedLinkListItem | null>(null);

  // Re-seed the fields every time the dialog opens: a fresh create form, or
  // the current values of the link being edited.
  React.useEffect(() => {
    if (!open) return;
    setDestinationUrl(editing?.destinationUrl ?? "");
    setLabel(editing?.label ?? "");
    setError(null);
    setSubmitting(false);
    setCreated(null);
  }, [open, editing]);

  function close() {
    if (submitting) return;
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = destinationUrl.trim();
    if (!isWebUrl(url)) {
      setError("Enter a full URL starting with http:// or https://");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (editing) {
        const link = await linksApi.update(editing.id, { destinationUrl: url, label: label.trim() || null });
        toast.success("Link updated");
        onSaved(link, "edit");
        onOpenChange(false);
      } else {
        const link = await linksApi.create({ destinationUrl: url, label: label.trim() || undefined });
        toast.success("Link created");
        onSaved(link, "create");
        setCreated(link);
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the link"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Your link is ready</DialogTitle>
              <DialogDescription>Paste it into a message button or reply. Every tap is counted.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{created.shortUrl}</code>
              <CopyButton value={created.shortUrl} label="Copy" successMessage="Short link copied" />
            </div>
            <p className="truncate text-xs text-muted-foreground" title={created.destinationUrl}>
              → {created.destinationUrl}
            </p>
            <DialogFooter className="mt-2 gap-2 sm:gap-0">
              <Button type="button" variant="outline" asChild>
                <a href={created.shortUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Test link
                </a>
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)} autoFocus>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit link" : "New tracked link"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "The short link stays the same, so links you've already sent will open the new address."
                  : "A short link that counts every tap. Use it in DM buttons, broadcasts or your bio."}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="link-destination">Destination URL</Label>
                <Input
                  id="link-destination"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://example.com/offer"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="link-label">Label</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {label.length}/{LABEL_MAX}
                  </span>
                </div>
                <Input
                  id="link-label"
                  placeholder="Autumn sale reel"
                  value={label}
                  maxLength={LABEL_MAX}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Optional. Only your team sees it.</p>
              </div>
              {error ? (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <DialogFooter className="mt-6 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                {editing ? "Save changes" : "Create link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
