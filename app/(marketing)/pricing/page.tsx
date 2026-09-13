import type { Metadata } from "next";
import type { PlanTier } from "@prisma/client";
import { Check, Minus } from "lucide-react";

import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Container, SectionText, SectionTitle } from "@/components/marketing/section";
import { annualSavingsPercent, PLAN_ORDER, PLANS, type PlanLimits, PURCHASABLE_PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${brand.name} plans and prices in US dollars. Start free with one Instagram or Facebook account and upgrade when you need more.`,
};

const count = (n: number) => n.toLocaleString("en-US");

type Row = { label: string; value: (plan: PlanLimits, tier: PlanTier) => string | boolean };

const comparison: Array<{ group: string; rows: Row[] }> = [
  {
    group: "Limits",
    rows: [
      { label: "Connected Instagram or Facebook accounts", value: (p) => count(p.channels) },
      { label: "Automations", value: (p) => count(p.automations) },
      { label: "DMs per month", value: (p) => count(p.dmsPerMonth) },
      { label: "Team members", value: (p) => count(p.members) },
    ],
  },
  {
    group: "Features",
    rows: [
      { label: "Broadcasts", value: (p) => p.broadcasts },
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
    "Payments are handled by Dodo Payments, our payment provider, which also takes care of tax and invoices. The Free plan doesn’t need a card.",
    "DM counts reset on the 1st of every month. Automated replies, broadcasts and replies from the inbox all count; public replies under comments don’t.",
    "If you reach your limit, messages stop until the reset or until you upgrade. You are never charged for extra messages.",
    "Upgrades apply straight away, and you pay the difference for the rest of the billing period.",
    "You can cancel from Settings at any time. Your plan stays active until the end of the period you paid for.",
  ];

  return (
    <>
      <section>
        <Container className="pb-20 pt-14 sm:pb-24 sm:pt-20">
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[54px]">Pricing</h1>
          <p className="mt-5 max-w-[40rem] text-[17px] leading-[1.6] text-muted-foreground sm:text-[18px]">
            Every plan has the same automations, inbox, contacts, tracked links and analytics. Choose by how many
            accounts, DMs and teammates you need. Broadcasts start on Starter.
          </p>
          <PricingPlans className="mt-12" />
        </Container>
      </section>

      <section className="border-t">
        <Container className="py-20 sm:py-24">
          <SectionTitle>Compare plans</SectionTitle>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <caption className="sr-only">What each plan includes</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="w-[40%] py-3 pr-4 text-[13px] font-normal text-muted-foreground">
                    <span className="sr-only">Feature</span>
                  </th>
                  {PLAN_ORDER.map((tier) => (
                    <th key={tier} scope="col" className="px-3 py-3 text-right text-[14px] font-semibold">
                      {PLANS[tier].label}
                    </th>
                  ))}
                </tr>
              </thead>
              {comparison.map((section) => (
                <tbody key={section.group}>
                  <tr>
                    <th colSpan={PLAN_ORDER.length + 1} scope="colgroup" className="pb-2 pt-8 text-left text-[13px] font-medium text-muted-foreground">
                      {section.group}
                    </th>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.label} className="border-t">
                      <th scope="row" className="py-3 pr-4 text-[14px] font-normal text-foreground">
                        {row.label}
                      </th>
                      {PLAN_ORDER.map((tier) => {
                        const v = row.value(PLANS[tier], tier);
                        return (
                          <td key={tier} className="px-3 py-3 text-right text-[14px] tabular-nums">
                            {typeof v === "boolean" ? (
                              v ? (
                                <Check role="img" aria-label="Included" className="ml-auto size-4" strokeWidth={2.25} />
                              ) : (
                                <Minus role="img" aria-label="Not included" className="ml-auto size-4 text-muted-foreground/70" strokeWidth={2} />
                              )
                            ) : (
                              v
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Container>
      </section>

      <section className="border-t">
        <Container className="grid gap-x-16 gap-y-8 py-20 sm:py-24 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionTitle>How billing works</SectionTitle>
            <SectionText className="mt-4">
              Questions about a plan? Email{" "}
              <a href={`mailto:${brand.supportEmail}`} className="font-medium text-foreground underline underline-offset-4">
                {brand.supportEmail}
              </a>
              .
            </SectionText>
          </div>
          <ul className="border-t lg:col-span-8">
            {billing.map((item) => (
              <li key={item} className="border-b py-4 text-[15px] leading-[1.65] text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
