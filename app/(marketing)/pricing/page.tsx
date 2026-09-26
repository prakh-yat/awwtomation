import type { Metadata } from "next";
import type { PlanTier } from "@prisma/client";

import { type ComparisonGroup, PlanComparison } from "@/components/marketing/plan-comparison";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { count, RECOMMENDED_PLAN } from "@/components/marketing/plans";
import { Band, Container, Eyebrow, SectionText, SectionTitle } from "@/components/marketing/section";
import { annualSavingsPercent, historyLabel, PLAN_ORDER, PLANS, type PlanLimits, PURCHASABLE_PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${brand.name} plans and prices in US dollars, from one shop to an agency with fifty accounts.`,
};

type Row = { label: string; value: (plan: PlanLimits, tier: PlanTier) => string | boolean };

const comparison: Array<{ group: string; rows: Row[] }> = [
  {
    group: "Limits",
    rows: [
      { label: "Connected Instagram or Facebook accounts", value: (p) => count(p.channels) },
      { label: "Workspaces", value: (p) => count(p.workspaces) },
      { label: "Automations", value: (p) => count(p.automations) },
      { label: "DMs per month", value: (p) => count(p.dmsPerMonth) },
      { label: "Contacts", value: (p) => count(p.contacts) },
      { label: "Broadcasts per month", value: (p) => (p.broadcastsPerMonth > 0 ? count(p.broadcastsPerMonth) : false) },
      { label: "AI agents per workspace", value: (p) => count(p.aiAgentsPerWorkspace) },
      { label: "Pipelines per workspace", value: (p) => count(p.pipelinesPerWorkspace) },
      { label: "Conversation and log history", value: (p) => historyLabel(p.historyDays) },
      { label: "Team members", value: (p) => count(p.members) },
    ],
  },
  {
    group: "Features",
    rows: [
      { label: "Comment, DM and story-reply triggers", value: () => true },
      { label: "Flow builder", value: () => true },
      { label: "Follow check", value: () => true },
      { label: "Public replies under comments", value: () => true },
      { label: "Inbox for Instagram and Messenger", value: () => true },
      { label: "Contacts, stages and segments", value: () => true },
      { label: "CSV import", value: () => true },
      { label: "Tracked links and analytics", value: () => true },
    ],
  },
  {
    group: "Support",
    rows: [
      { label: "Email support", value: () => true },
      { label: "Priority support", value: (_p, tier) => tier === "PRO" || tier === "AGENCY" },
      { label: "Dedicated onboarding", value: (_p, tier) => tier === "AGENCY" },
    ],
  },
];

export default function PricingPage() {
  const savings = Math.min(...PURCHASABLE_PLANS.map(annualSavingsPercent));

  const billing = [
    `Prices are in US dollars. Paying yearly costs ${savings}% less than twelve monthly payments.`,
    "Payments are handled by Dodo Payments, our payment provider, which also takes care of tax and invoices.",
    "You can sign up, connect an account and build automations before you pay. Nothing is sent until you choose a plan.",
    "DM counts reset on the 1st of every month. Automated replies, broadcasts and replies from the inbox all count; public replies under comments don’t.",
    "If you reach your limit, messages stop until the reset or until you upgrade. You are never charged for extra messages.",
    "At the contact limit, new people who comment or message you are not saved: no contact, no inbox thread and no automated reply until you upgrade.",
    "Conversations and delivery logs older than your plan’s history are deleted. Contacts, automations and broadcast totals are kept.",
    "Upgrades apply straight away, and you pay the difference for the rest of the billing period.",
    "You can cancel from Settings at any time. Your plan stays active until the end of the period you paid for.",
  ];

  // Resolved here so the client table gets plain values, not functions.
  const plans = PLAN_ORDER.map((tier) => ({ tier, label: PLANS[tier].label }));
  const groups: ComparisonGroup[] = comparison.map((section) => ({
    group: section.group,
    rows: section.rows.map((row) => ({ label: row.label, values: PLAN_ORDER.map((tier) => row.value(PLANS[tier], tier)) })),
  }));

  return (
    <>
      <Band>
        <Container className="pb-20 pt-28 sm:pb-24 sm:pt-36">
          <div className="mx-auto max-w-4xl text-center">
            <Eyebrow className="text-muted-foreground">Pricing</Eyebrow>
            <h1 className="mt-5 text-balance font-display text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.88] tracking-[-0.04em]">
              Every feature on every plan.
            </h1>
            <p className="mx-auto mt-6 max-w-[38rem] text-pretty text-[17px] leading-[1.55] text-muted-foreground sm:text-[19px]">
              Every plan has the same automations, AI replies, inbox, contacts, broadcasts, tracked links and
              analytics. Choose by how many accounts, DMs and teammates you need.
            </p>
          </div>
          <PricingPlans className="mt-12" />
        </Container>
      </Band>

      <Band>
        <Container className="pb-20 sm:pb-28">
          <SectionTitle className="text-center">Compare plans</SectionTitle>
          <PlanComparison className="mt-10 sm:mt-12" plans={plans} groups={groups} recommended={RECOMMENDED_PLAN} />
        </Container>
      </Band>

      <Band tone="fog">
        <Container className="grid gap-x-16 gap-y-8 py-20 sm:py-24 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionTitle>How billing works</SectionTitle>
            <SectionText className="mt-5">
              Questions about a plan? Email{" "}
              <a
                href={`mailto:${brand.supportEmail}`}
                className="rounded-sm font-semibold text-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {brand.supportEmail}
              </a>
              .
            </SectionText>
          </div>
          <ul className="border-t border-ink/10 lg:col-span-8">
            {billing.map((item) => (
              <li key={item} className="border-b border-ink/10 py-4 text-[15px] leading-[1.65] text-ink/80 sm:text-[16px]">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </Band>
    </>
  );
}
