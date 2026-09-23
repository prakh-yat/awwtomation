"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Clock } from "lucide-react";

import { apiFetch, ClientApiError, errorMessage } from "@/components/settings/client-api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ServiceState } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import type { BillingOverview } from "@/lib/services/billing";
import { cn } from "@/lib/utils";

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

/** The tilted colour tile each state opens with, as on the empty states. */
function StateTile({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto flex h-14 w-14 rotate-[-4deg] items-center justify-center rounded-2xl shadow-[0_10px_24px_-12px_rgb(15_15_15/0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function StateBody({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="font-display mt-6 text-[28px] leading-none">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{children}</p>
    </>
  );
}

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
        // 403 means the ids belong to another organization: no amount of waiting fixes that.
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
      <div className="animate-fade-in text-center">
        <StateTile className="bg-green text-white">
          <CircleCheck className="h-7 w-7" strokeWidth={2} />
        </StateTile>
        <StateBody title={`You're on ${plan.label}`}>
          {plan.channels} accounts, {plan.automations.toLocaleString("en-US")} automations and {plan.dmsPerMonth.toLocaleString("en-US")} DMs a month
          are ready to use.
          {overview.customerEmail ? ` A receipt is on its way to ${overview.customerEmail}.` : ""}
        </StateBody>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
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
      <div className="animate-fade-in text-center">
        <StateTile className="bg-destructive text-white">
          <CircleX className="h-7 w-7" strokeWidth={2} />
        </StateTile>
        <StateBody title="Payment didn't go through">
          {lastError ?? "Your card wasn't charged. Try again with the same card or another one."}
        </StateBody>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
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
      <div className="animate-fade-in text-center">
        <StateTile className="bg-fog text-ink">
          <Clock className="h-7 w-7" strokeWidth={2} />
        </StateTile>
        <StateBody title="This is taking longer than usual">
          Your plan switches on within a minute or two of paying.
        </StateBody>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
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
          <a href={`mailto:${brand.supportEmail}`} className="font-semibold text-ink underline underline-offset-2 hover:no-underline">
            {brand.supportEmail}
          </a>{" "}
          with your organization name.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center" aria-live="polite">
      <StateTile className="bg-fog">
        <Spinner size="lg" className="text-ink" />
      </StateTile>
      <StateBody title="Activating your plan…">This usually takes a few seconds. Keep this tab open.</StateBody>
    </div>
  );
}
