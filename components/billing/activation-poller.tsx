"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { apiFetch, ClientApiError, errorMessage } from "@/components/settings/client-api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ServiceState } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import type { BillingOverview } from "@/lib/services/billing";

const POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 30; // ≈ 60s

const ACTIVE_STATES: ServiceState[] = ["active", "trialing"];

export interface ActivationPollerProps {
  ids: { sessionId?: string; paymentId?: string; subscriptionId?: string };
  /**
   * Set when the checkout was started from another organization than the one
   * open in this browser (a second tab switched it). We open that organization
   * first so the check runs against the right account.
   */
  switchToOrganizationId?: string;
  /** Dodo's `status` query param, e.g. "succeeded" / "failed". */
  providerStatus?: string;
  retryHref: string;
}

type Phase = "polling" | "active" | "timeout" | "failed";

/**
 * Polls /api/billing/reconcile until the subscription is active. The webhook
 * usually wins the race, but reconcile reads Dodo directly so the page still
 * completes when webhooks are delayed or (locally) not reachable at all.
 */
export function ActivationPoller({ ids, switchToOrganizationId, providerStatus, retryHref }: ActivationPollerProps) {
  const paymentFailed = providerStatus === "failed" || providerStatus === "cancelled";
  const [phase, setPhase] = React.useState<Phase>(paymentFailed ? "failed" : "polling");
  const [overview, setOverview] = React.useState<BillingOverview | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);

  React.useEffect(() => {
    if (phase !== "polling") return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let switched = !switchToOrganizationId;

    async function tick() {
      if (!switched) {
        try {
          await apiFetch("/api/organizations/active", { method: "POST", json: { organizationId: switchToOrganizationId } });
          switched = true;
        } catch {
          // Not a member any more: the reconcile call below reports it.
          switched = true;
        }
        if (cancelled) return;
      }
      attempts += 1;
      try {
        const result = await apiFetch<BillingOverview>("/api/billing/reconcile", { method: "POST", json: ids });
        if (cancelled) return;
        setOverview(result);
        if (ACTIVE_STATES.includes(result.serviceState)) {
          setPhase("active");
          return;
        }
      } catch (err) {
        if (cancelled) return;
        // 403 means the ids belong to another organization — no amount of waiting fixes that.
        if (err instanceof ClientApiError && err.status === 403) {
          setLastError(errorMessage(err, "This payment belongs to a different organization. Switch to it from the account menu, then check Billing."));
          setPhase("failed");
          return;
        }
        setLastError(errorMessage(err, "We couldn't check the payment just now."));
      }
      if (attempts >= MAX_ATTEMPTS) {
        setPhase("timeout");
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `ids` is stable for the page's lifetime; `round` restarts polling after a timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  if (phase === "active" && overview) {
    const plan = PLANS[overview.effectivePlan];
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
          <CheckCircle2 className="h-6 w-6" strokeWidth={2} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">You&apos;re on {plan.label}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {plan.channels} accounts, {plan.automations.toLocaleString("en-US")} automations and{" "}
          {plan.dmsPerMonth.toLocaleString("en-US")} DMs a month are ready to use.
          {overview.customerEmail ? ` A receipt is on its way to ${overview.customerEmail}.` : ""}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/settings/billing">Manage billing</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-background">
          <XCircle className="h-6 w-6 text-destructive" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Payment didn&apos;t go through</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {lastError ?? "Your card wasn't charged. You can try again with the same or a different payment method."}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href={retryHref}>Try again</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/settings/billing">Back to billing</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "timeout") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-background">
          <Clock className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">This is taking longer than usual</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          If your payment went through, the plan usually switches on within a minute. Check again, or carry on and the upgrade will show up by
          itself.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            onClick={() => {
              setLastError(null);
              setRound((r) => r + 1);
              setPhase("polling");
            }}
          >
            Check again
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Still not active after a few minutes? Email{" "}
          <a href={`mailto:${brand.supportEmail}`} className="underline underline-offset-2 hover:text-foreground">
            {brand.supportEmail}
          </a>{" "}
          with your organization name and we&apos;ll sort it out.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center" aria-live="polite">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-background">
        <Spinner />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">Activating your plan…</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Confirming your payment. This usually takes a few seconds, so keep this tab open.
      </p>
    </div>
  );
}
