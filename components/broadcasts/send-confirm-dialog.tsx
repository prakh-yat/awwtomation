"use client";

import * as React from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

import { apiFetch, errorMessage } from "./api";
import { formatCount } from "./format";
import type { AudienceEstimate, BroadcastAudience } from "./types";

export interface SendConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  channelId: string;
  audience: BroadcastAudience;
  /** Pass a fresh estimate to skip the fetch (the editor already has one). */
  estimate?: AudienceEstimate | null;
  /** Resolve to close; throw (after toasting) to keep the dialog open. */
  onConfirm: (estimate: AudienceEstimate) => Promise<void>;
}

/**
 * The last thing a user sees before a broadcast goes out: exactly how many
 * people will get it right now, and how many won't because of the 24h rule.
 */
function SendConfirmDialog({ open, onOpenChange, name, channelId, audience, estimate: given, onConfirm }: SendConfirmDialogProps) {
  const [estimate, setEstimate] = React.useState<AudienceEstimate | null>(given ?? null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (given) {
      setEstimate(given);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch<AudienceEstimate>("/api/broadcasts/estimate", { method: "POST", json: { channelId, audience }, signal: controller.signal })
      .then((data) => setEstimate(data))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setEstimate(null);
        setError(errorMessage(err, "Couldn't estimate the audience"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, given, channelId, audience]);

  async function confirm() {
    if (!estimate) return;
    setPending(true);
    try {
      await onConfirm(estimate);
      onOpenChange(false);
    } catch {
      // Caller has toasted; keep the dialog open for a retry.
    } finally {
      setPending(false);
    }
  }

  const eligible = estimate?.eligible ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send “{name || "this broadcast"}” now?</DialogTitle>
          <DialogDescription>It goes out as soon as you confirm.</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-orange p-5 text-ink">
          {loading ? (
            <div className="flex items-center gap-2 text-sm font-medium">
              <Spinner size="sm" /> Counting…
            </div>
          ) : error ? (
            <p className="text-sm font-semibold">{error}</p>
          ) : estimate ? (
            <div>
              <p className="brand-label">Can get it now</p>
              <p className="font-display mt-1 text-[48px] leading-none tabular-nums">{formatCount(estimate.eligible)}</p>
              <p className="mt-3 text-[13px]">
                {formatCount(estimate.total)} match. {formatCount(estimate.skippedWindow)} have not messaged you in the last 24 hours, so they are skipped.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} loading={pending} disabled={loading || !estimate || eligible === 0}>
            <Send />
            {estimate && eligible === 0 ? "No one can get it right now" : `Send to ${formatCount(eligible)} ${eligible === 1 ? "person" : "people"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { SendConfirmDialog };
