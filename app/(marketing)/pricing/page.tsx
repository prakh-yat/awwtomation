import type { Metadata } from "next";
import Link from "next/link";
import type { PlanTier } from "@prisma/client";
import { Check, Minus } from "lucide-react";

import { Section } from "@/components/marketing/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PLAN_ORDER, PLANS, type PlanLimits } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { cn, formatNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Simple monthly pricing for ${brand.name}. Start free, upgrade as your DMs grow.`,
};

const HIGHLIGHT: PlanTier = "PRO";

function limitRows(plan: PlanLimits): string[] {
  return [
    `${plan.channels} connected ${plan.channels === 1 ? "channel" : "channels"}`,
    `${formatNumber(plan.dmsPerMonth)} DMs per month`,
    `${plan.automations} ${plan.automations === 1 ? "automation" : "automations"}`,
    `${plan.members} team ${plan.members === 1 ? "member" : "members"}`,
    plan.broadcasts ? "Broadcasts to tagged audiences" : "Broadcasts not included",
  ];
}

const comparison: Array<{ label: string; value: (p: PlanLimits) => string | boolean }> = [
  { label: "Connected channels", value: (p) => String(p.channels) },
  { label: "Automations", value: (p) => String(p.automations) },
  { label: "DMs per month", value: (p) => formatNumber(p.dmsPerMonth) },
  { label: "Team members", value: (p) => String(p.members) },
  { label: "Broadcasts", value: (p) => p.broadcasts },
  { label: "Flow builder", value: () => true },
  { label: "Follow gate", value: () => true },
  { label: "Unified inbox", value: () => true },
  { label: "Tracked links & analytics", value: () => true },
];

export default function PricingPage() {
  return (
    <>
      <Section
        eyebrow="Pricing"
        title="Simple, transparent pricing."
        description="Every plan runs the same automation engine on the official Meta API. Pick the limits that match your audience; change or cancel any time."
        align="center"
        className="pb-8"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            const highlighted = tier === HIGHLIGHT;
            return (
              <div
                key={tier}
                className={cn(
                  "relative flex flex-col rounded-lg border p-6 shadow-card",
                  highlighted ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold tracking-tight">{plan.label}</h2>
                  {highlighted ? (
                    <Badge className="border-primary-foreground/20 bg-background text-foreground">Most popular</Badge>
                  ) : null}
                </div>
                <p className={cn("mt-1 text-[13px]", highlighted ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {plan.description}
                </p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">${plan.priceUsd}</span>
                  <span className={cn("text-sm", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    /month
                  </span>
                </p>
                <Button
                  asChild
                  className={cn("mt-6", highlighted && "bg-background text-foreground hover:bg-background/90")}
                  variant={highlighted ? "secondary" : tier === "FREE" ? "outline" : "default"}
                >
                  <Link href="/login">{tier === "FREE" ? "Start for free" : `Get ${plan.label}`}</Link>
                </Button>
                <ul className="mt-6 space-y-2.5 text-[13px]">
                  {[...limitRows(plan), ...plan.features].map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        className={cn("mt-0.5 shrink-0", highlighted ? "text-primary-foreground" : "text-foreground")}
                      />
                      <span className={highlighted ? "text-primary-foreground/85" : "text-foreground/80"}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prices in USD. DM limits reset on the first of each month. Upgrades take effect immediately.
        </p>
      </Section>

      <Section eyebrow="Compare" title="Every plan, side by side." width="default" className="pt-8">
        <div className="overflow-hidden rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40%]">Feature</TableHead>
                {PLAN_ORDER.map((tier) => (
                  <TableHead key={tier} className="text-center">
                    {PLANS[tier].label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  {PLAN_ORDER.map((tier) => {
                    const v = row.value(PLANS[tier]);
                    return (
                      <TableCell key={tier} className="text-center tabular-nums">
                        {typeof v === "boolean" ? (
                          v ? (
                            <Check size={16} className="mx-auto" aria-label="Included" />
                          ) : (
                            <Minus size={16} className="mx-auto text-muted-foreground" aria-label="Not included" />
                          )
                        ) : (
                          v
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section inverted align="center" className="py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight">Not sure which plan fits?</h2>
          <p className="mt-3 text-base text-primary-foreground/70">
            Start on Free — it includes a real channel and 100 DMs a month. Upgrade from Settings when you need more.
          </p>
          <Button asChild size="lg" className="mt-8 h-11 bg-background px-6 text-foreground hover:bg-background/90">
            <Link href="/login">Create your account</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
