"use client";

import * as React from "react";
import Link from "next/link";
import type { PlanTier } from "@prisma/client";
import { AlertCircle, ArrowLeft, Lock, RefreshCcw, ShieldCheck, Undo2 } from "lucide-react";

import { FEATURED_COUNTRIES, OTHER_COUNTRIES } from "@/components/billing/countries";
import { OrderSummary } from "@/components/billing/order-summary";
import { apiFetch, errorMessage } from "@/components/settings/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { type BillingIntervalId, formatUsd, PLANS, planPriceCents } from "@/lib/billing/plans";
import type { DodoMode } from "@/lib/billing/dodo/config";

type CheckoutResponse = { checkoutUrl: string; sessionId: string; mode: DodoMode };

type Notice = { kind: "info" | "error"; title: string; body?: string } | null;

export interface CheckoutClientProps {
  tier: PlanTier;
  initialInterval: BillingIntervalId;
  email: string;
  defaultName: string;
  organizationName: string;
  /** Test/live is decided server-side; the overlay SDK just needs to match. */
  mode: DodoMode;
}

/**
 * The whole checkout body (form + order summary) lives in one client
 * component so the interval toggle can update both price and form without a
 * server round-trip. The card itself is collected by Dodo's overlay — we
 * never see it — so this form only gathers what the invoice needs.
 */
export function CheckoutClient({ tier, initialInterval, email, defaultName, organizationName, mode }: CheckoutClientProps) {
  const [interval, setInterval] = React.useState<BillingIntervalId>(initialInterval);
  const [name, setName] = React.useState(defaultName);
  const [country, setCountry] = React.useState("");
  const [businessName, setBusinessName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const lastSession = React.useRef<CheckoutResponse | null>(null);

  const plan = PLANS[tier];
  const amount = formatUsd(planPriceCents(tier, interval));

  function changeInterval(next: BillingIntervalId) {
    setInterval(next);
    lastSession.current = null; // a session is priced for one product; don't reuse it
    // Keep the URL shareable/refresh-safe without triggering a server render.
    const url = new URL(window.location.href);
    url.searchParams.set("tier", tier);
    url.searchParams.set("interval", next);
    window.history.replaceState(window.history.state, "", url.toString());
  }

  async function openOverlay(session: CheckoutResponse) {
    // Imported lazily: the SDK touches `window` at load time and only the click path needs it.
    const { DodoPayments } = await import("dodopayments-checkout");
    DodoPayments.Initialize({
      // The server decided test/live when it rendered the page; the session echoes the same value.
      mode: session.mode ?? mode,
      displayType: "overlay",
      onEvent: (event) => {
        switch (event.event_type) {
          case "checkout.closed":
            setSubmitting(false);
            setNotice({ kind: "info", title: "Checkout closed. Nothing was charged.", body: "You can pick up where you left off." });
            break;
          case "checkout.error":
            setSubmitting(false);
            setNotice({
              kind: "error",
              title: "Something went wrong inside the checkout.",
              body: typeof event.data?.message === "string" ? event.data.message : "Please try again or use a different card.",
            });
            break;
          case "checkout.link_expired":
            lastSession.current = null;
            setSubmitting(false);
            setNotice({ kind: "error", title: "That checkout link expired.", body: "Start again to get a fresh one." });
            break;
          default:
            // checkout.redirect etc. — the SDK navigates to our success page on its own.
            break;
        }
      },
    });
    DodoPayments.Checkout.open({ checkoutUrl: session.checkoutUrl, options: { showTimer: true, showSecurityBadge: true } });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setNotice({ kind: "error", title: "Enter the name that should appear on the invoice." });
      return;
    }
    if (!country) {
      setNotice({ kind: "error", title: "Choose your billing country.", body: "We need it to work out tax." });
      return;
    }
    setNotice(null);
    setSubmitting(true);

    let session = lastSession.current;
    try {
      if (!session) {
        session = await apiFetch<CheckoutResponse>("/api/billing/checkout", {
          method: "POST",
          json: {
            tier,
            interval,
            billing: { name: name.trim(), country, ...(businessName.trim() ? { businessName: businessName.trim() } : {}) },
          },
        });
        lastSession.current = session;
      }
    } catch (err) {
      setSubmitting(false);
      const message = errorMessage(err, "Couldn't start checkout");
      setNotice({ kind: "error", title: message });
      toast.error(message);
      return;
    }

    try {
      await openOverlay(session);
    } catch {
      // Overlay unavailable (script blocked, old browser) — the hosted page works everywhere.
      window.location.assign(session.checkoutUrl);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-10 lg:items-end lg:px-16 lg:py-14">
        <div className="w-full max-w-md">
          <Link
            href="/settings/billing"
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to billing
          </Link>

          <div className="mt-6">
            <h1 className="text-2xl font-semibold tracking-tight">Payment details</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upgrading <span className="font-medium text-foreground">{organizationName}</span> to {plan.label}. You&apos;ll enter your card in a secure
              payment window next. Nothing is charged until you confirm there.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="co-name">Full name</Label>
                <Input
                  id="co-name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sita Rai"
                  required
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="co-email">Email</Label>
                <Input id="co-email" name="email" type="email" value={email} readOnly className="bg-muted/40 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Receipts go to your sign-in email.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="co-country">Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger id="co-country" aria-label="Billing country">
                    <SelectValue placeholder="Choose a country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Popular</SelectLabel>
                      {FEATURED_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>All countries</SelectLabel>
                      {OTHER_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="co-business">
                  Business name <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="co-business"
                  name="organization"
                  autoComplete="organization"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Shown on invoices instead of your name"
                  maxLength={160}
                />
              </div>

              {notice ? (
                <div
                  role={notice.kind === "error" ? "alert" : "status"}
                  className={
                    notice.kind === "error"
                      ? "flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[13px]"
                      : "flex items-start gap-2.5 rounded-md border bg-muted/40 p-3 text-[13px]"
                  }
                >
                  {notice.kind === "error" ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{notice.title}</p>
                    {notice.body ? <p className="mt-0.5 text-muted-foreground">{notice.body}</p> : null}
                    {notice.kind === "error" ? (
                      <button type="submit" className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
                        <RefreshCcw className="h-3 w-3" />
                        Try again
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <Button type="submit" size="lg" className="w-full" loading={submitting}>
                {submitting ? "Opening secure checkout…" : `Continue to secure payment · ${amount}`}
              </Button>
            </form>

            <ul className="mt-6 space-y-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                Your card goes straight to our payment provider. We never see it.
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                Your bank may ask you to confirm the payment.
              </li>
              <li className="flex items-center gap-2">
                <Undo2 className="h-3.5 w-3.5 shrink-0" />
                Cancel any time from Settings.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t bg-muted/40 px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-16 lg:py-14">
        <div className="w-full max-w-md">
          <OrderSummary tier={tier} interval={interval} onIntervalChange={changeInterval} />
        </div>
      </div>
    </div>
  );
}
