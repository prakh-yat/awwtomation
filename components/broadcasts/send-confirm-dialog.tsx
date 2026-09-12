"use client";

import * as React from "react";
import { Clock, Send } from "lucide-react";

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
          <DialogDescription>Recipients are decided the moment you confirm.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Counting eligible contacts…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : estimate ? (
            <div className="space-y-2">
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {formatCount(estimate.eligible)} <span className="text-sm font-normal text-muted-foreground">will receive it now</span>
              </p>
              <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {formatCount(estimate.skippedWindow)} of the {formatCount(estimate.total)} matching contacts are outside the 24-hour window. They are
                  logged as skipped and never messaged.
                </span>
              </p>
              <p className="text-[12px] text-muted-foreground">Uses {formatCount(estimate.eligible)} DMs from your monthly quota.</p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} loading={pending} disabled={loading || !estimate || eligible === 0}>
            <Send />
            {estimate && eligible === 0 ? "No one is eligible right now" : `Send to ${formatCount(eligible)} contact${eligible === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { SendConfirmDialog };
