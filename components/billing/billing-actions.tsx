"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/settings/client-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceState } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";
import type { BillingOverview } from "@/lib/services/billing";

const CANCEL_REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "too_expensive", label: "It's too expensive" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "unused", label: "I'm not using it enough" },
  { value: "switched_service", label: "Switching to another tool" },
  { value: "too_complex", label: "Too complicated to set up" },
  { value: "low_quality", label: "Didn't work well for me" },
  { value: "customer_service", label: "Support experience" },
  { value: "other", label: "Something else" },
];

export interface BillingActionsProps {
  overview: BillingOverview;
  /** OWNER only. Admins get disabled buttons with an explanation. */
  canManage: boolean;
}

/**
 * Buttons on the current-plan card. Each action hits its own route and then
 * refreshes the server-rendered page, so the card, plan grid and payment
 * history all reflect the new state without client-side bookkeeping.
 */
export function BillingActions({ overview, canManage }: BillingActionsProps) {
  const router = useRouter();
  const [portalPending, setPortalPending] = React.useState(false);
  const [resumePending, setResumePending] = React.useState(false);

  const state: ServiceState = overview.serviceState;
  const disabledReason = !canManage ? "Only the workspace owner can change billing" : !overview.configured ? "Billing isn't configured yet" : null;

  async function openPortal() {
    setPortalPending(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't open the billing portal"));
      setPortalPending(false);
    }
  }

  async function resume() {
    setResumePending(true);
    try {
      await apiFetch<BillingOverview>("/api/billing/resume", { method: "POST" });
      toast.success("Cancellation reverted — your plan will keep renewing");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't resume the subscription"));
    } finally {
      setResumePending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {overview.hasSubscription ? (
        <>
          <Button asChild size="sm">
            <Link href="#plans">Change plan</Link>
          </Button>
          {state === "cancelling" ? (
            <Button size="sm" variant="outline" onClick={resume} loading={resumePending} disabled={Boolean(disabledReason)} title={disabledReason ?? undefined}>
              Resume plan
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={openPortal}
            loading={portalPending}
            disabled={Boolean(disabledReason) || !overview.hasCustomer}
            title={disabledReason ?? (!overview.hasCustomer ? "No billing account yet" : undefined)}
          >
            Manage payment methods &amp; invoices
            <ExternalLink />
          </Button>
          {state !== "cancelling" ? (
            <CancelDialog overview={overview} disabledReason={disabledReason} onDone={() => router.refresh()} />
          ) : null}
        </>
      ) : (
        <>
          <Button asChild size="sm">
            <Link href="#plans">Upgrade</Link>
          </Button>
          {overview.hasCustomer ? (
            <Button size="sm" variant="outline" onClick={openPortal} loading={portalPending} disabled={Boolean(disabledReason)} title={disabledReason ?? undefined}>
              Past invoices
              <ExternalLink />
            </Button>
          ) : null}
        </>
      )}
      {!canManage ? <p className="basis-full text-xs text-muted-foreground">Only the workspace owner can change billing.</p> : null}
    </div>
  );
}

function CancelDialog({
  overview,
  disabledReason,
  onDone,
}: {
  overview: BillingOverview;
  disabledReason: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>("");
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const planLabel = PLANS[overview.subscribedPlan ?? overview.effectivePlan].label;
  const endDate = overview.currentPeriodEnd
    ? new Date(overview.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  async function confirm() {
    setPending(true);
    try {
      await apiFetch<BillingOverview>("/api/billing/cancel", {
        method: "POST",
        json: { ...(reason ? { feedback: reason } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) },
      });
      toast.success(endDate ? `Your plan will end on ${endDate}` : "Your plan is set to cancel");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't cancel the subscription"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={Boolean(disabledReason)} title={disabledReason ?? undefined}>
          Cancel plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel the {planLabel} plan?</DialogTitle>
          <DialogDescription>
            {endDate
              ? `You keep everything until ${endDate}, then the workspace moves to Free limits. Nothing is refunded and you can resume any time before then.`
              : "The workspace moves to Free limits at the end of the current period. You can resume any time before then."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Why are you cancelling?</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="cancel-reason">
                <SelectValue placeholder="Choose a reason (optional)" />
              </SelectTrigger>
              <SelectContent>
                {CANCEL_REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-comment">Anything we should know?</Label>
            <Textarea
              id="cancel-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional — this goes straight to the team."
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Keep my plan
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} loading={pending}>
            Cancel at period end
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
