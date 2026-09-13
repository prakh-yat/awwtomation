import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";

import { AnalyticsVisual } from "@/components/marketing/analytics-visual";
import { BroadcastVisual } from "@/components/marketing/broadcast-visual";
import { type FaqItem, FaqList } from "@/components/marketing/faq";
import { FlowVisual } from "@/components/marketing/flow-visual";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { InboxVisual } from "@/components/marketing/inbox-visual";
import { Container, SectionText, SectionTitle } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { annualSavingsPercent, PLAN_ORDER, PLANS, PURCHASABLE_PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  // `absolute` opts out of the root "%s · Brand" template so the brand isn't repeated.
  title: { absolute: `${brand.name} · Comment-to-DM automation for Instagram and Facebook` },
  description: brand.description,
};

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

const free = PLANS.FREE;
const annualSavings = Math.min(...PURCHASABLE_PLANS.map(annualSavingsPercent));

const automationOptions: Array<{ term: string; body: string }> = [
  {
    term: "Keywords.",
    body: "Match a word anywhere in the comment, only the exact word, or every comment. You can list words to skip, too.",
  },
  {
    term: "Public replies.",
    body: "Write a few short replies. Each comment gets one, picked at random, so the thread doesn’t look copy-pasted.",
  },
  {
    term: "Follow check.",
    body: "Send the link only to people who follow you. Anyone who doesn’t yet gets a button to tap once they have.",
  },
  {
    term: "More steps.",
    body: "Ask a question and save the answer, wait before the next message, or add a tag. Flows can also start from a DM or a story reply.",
  },
];

const metaRules: Array<{ term: string; body: string }> = [
  {
    term: "A professional account",
    body: "Automations work with Instagram professional accounts, meaning Business or Creator, and with Facebook Pages. Switching a personal Instagram account to professional is free and takes a minute in the app.",
  },
  {
    term: "One private reply per comment",
    body: "Meta allows one private reply to each comment on your own posts, sent within 7 days. By default, a person gets each automation’s message once, even if they comment again.",
  },
  {
    term: "The 24-hour window",
    body: "Once someone messages you or taps a button, you can keep messaging them for 24 hours. Broadcasts only go to people inside that window. After it closes, someone on your team can still reply from the inbox for up to 7 days.",
  },
  {
    term: "Hourly sending limits",
    body: "Meta limits how many private replies an account can send in an hour. When a post gets busier than that, replies wait in a queue and go out as the limit resets. Anything still waiting after 6 hours is logged as skipped, so nothing disappears quietly.",
  },
  {
    term: "Meta’s login, not your password",
    body: "You connect through Meta’s own login screen, so we never see your password. Access tokens are encrypted at rest, and you can disconnect an account at any time.",
  },
];

const faqs: FaqItem[] = [
  {
    question: "Does it work with a personal Instagram account?",
    answer:
      "No. Meta only allows messaging automation on professional accounts (Business or Creator) and on Facebook Pages. You can switch a personal account to professional for free in Instagram’s settings. Your posts and followers stay as they are.",
  },
  {
    question: "Is automated messaging allowed on Instagram?",
    answer: (
      <>
        Yes, when it goes through Meta’s official API and follows their messaging rules. {brand.name} only messages
        people who commented or wrote to you first, sends one private reply per comment, and keeps to the 24-hour
        window. <Link href="#meta-rules">Meta’s rules</Link> are explained in more detail above.
      </>
    ),
  },
  {
    question: "Do you need my Instagram or Facebook password?",
    answer: `No. You connect through Meta’s login screen, which gives ${brand.name} limited access to the account. You can remove that access at any time from the Channels page or from your Instagram or Facebook settings.`,
  },
  {
    question: "What counts as a DM on my plan?",
    answer:
      "Every private message the app sends: automated replies, broadcasts and the replies you type in the inbox. Public replies under comments don’t count. The count resets on the 1st of each month. If you reach your limit, messages stop until the reset or until you upgrade. You are never charged for extra messages.",
  },
  {
    question: "Can more than one person use it?",
    answer:
      "Yes. Invite teammates as admins or members, assign conversations to them, and leave notes that only your team can see. If you look after several brands or clients, give each one its own workspace.",
  },
  {
    question: "How do payments work?",
    answer:
      "Prices are in US dollars. Paid plans are charged through Dodo Payments, our payment provider, which also handles tax and invoices. The Free plan doesn’t need a card. You can cancel from Settings and keep your plan until the end of the period you paid for.",
  },
  {
    question: "What happens to my data if I stop using it?",
    answer: (
      <>
        You can disconnect an account and keep its data in case you come back, or delete the account’s data, a
        workspace or your whole organization for good. The <Link href="/data-deletion">data deletion page</Link> lists exactly what each
        option removes.
      </>
    ),
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section>
        <Container className="grid items-center gap-x-12 gap-y-14 pb-20 pt-12 sm:pt-16 lg:pb-28 lg:pt-20 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.22fr)]">
          <div>
            <h1 className="max-w-[15ch] text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-foreground sm:text-[54px]">
              When someone comments “
              <span className="underline decoration-lavender decoration-[0.09em] underline-offset-[0.14em]">link</span>
              ”, send them the link.
            </h1>
            <p className="mt-6 max-w-[33rem] text-[17px] leading-[1.6] text-muted-foreground sm:text-[18px]">
              Pick your Instagram or Facebook posts and a keyword. {brand.name} sends everyone who comments that word a
              private message with your link, replies under their comment, and saves them as a contact.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Button asChild size="lg" className="h-11 px-5 text-[15px]">
                <Link href="/login">Start free</Link>
              </Button>
              <Link
                href="/pricing"
                className="group inline-flex items-center gap-1.5 rounded-sm text-[15px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                See pricing
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </Link>
            </div>
          </div>
          <HeroVisual />
        </Container>
      </section>

      {/* One comment, start to finish */}
      <section id="how-it-works" className="scroll-mt-14 border-t">
        <Container className="grid gap-x-14 gap-y-14 py-20 sm:py-28 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] xl:items-start">
          <FlowVisual className="order-last xl:order-first" />
          <div className="max-w-2xl xl:max-w-none">
            <SectionTitle>What happens after someone comments</SectionTitle>
            <SectionText className="mt-4">
              An automation is a few steps: what to look for, what to send and what to note down. Himalayan Threads runs
              this one on two autumn collection posts. Here is what it did when Sita Rai commented on the reel.
            </SectionText>
            <div className="mt-9 space-y-4 border-t pt-8">
              {automationOptions.map((o) => (
                <p key={o.term} className="text-[15px] leading-[1.65] text-muted-foreground">
                  <span className="font-medium text-foreground">{o.term}</span> {o.body}
                </p>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Inbox and contacts */}
      <section id="inbox" className="scroll-mt-14 border-t bg-muted/30">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-x-16 gap-y-4 lg:grid-cols-12 lg:items-end">
            <SectionTitle className="lg:col-span-6">One inbox for Instagram and Messenger</SectionTitle>
            <SectionText className="lg:col-span-6 lg:col-start-7">
              When Sita asks about a size, the conversation is waiting in your inbox. Each thread shows how long Meta
              still lets you reply, who on your team is handling it, and the notes they left.
            </SectionText>
          </div>
          <InboxVisual className="mt-12" />
          <div className="mt-14 grid gap-10 md:grid-cols-2 md:gap-16">
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Contacts</h3>
              <p className="mt-2 text-[15px] leading-[1.65] text-muted-foreground">
                Everyone who comments, messages you or replies to a story becomes a contact. Build pipelines with your
                own stages, like New, Lead and Customer, and move people through them by hand or from an automation.
                Give contacts an owner, add tags and notes, save filters as segments and import a customer list from a
                CSV file.
              </p>
            </div>
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Teams and workspaces</h3>
              <p className="mt-2 text-[15px] leading-[1.65] text-muted-foreground">
                Invite teammates as admins or members and assign conversations to them. Run several brands or clients
                as workspaces under one plan, each with its own accounts and contacts, or give a client a separate
                organization with its own billing.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Broadcasts and analytics */}
      <section id="broadcasts" className="scroll-mt-14 border-t">
        <Container className="grid gap-x-16 py-20 sm:py-28 lg:grid-cols-2">
          <div className="lg:col-start-1 lg:row-start-1">
            <SectionTitle>Message everyone with a tag</SectionTitle>
            <SectionText className="mt-4 max-w-[31rem]">
              Pick a tag or a saved segment, write one message, and send it now or later. Meta only allows messages to
              people who contacted you in the last 24 hours, so you see how many can receive it before you send.
              Everyone else is skipped.
            </SectionText>
          </div>
          <BroadcastVisual className="mt-10 lg:col-start-1 lg:row-start-2" />
          <div className="mt-20 lg:col-start-2 lg:row-start-1 lg:mt-0">
            <SectionTitle>See what each automation did</SectionTitle>
            <SectionText className="mt-4 max-w-[31rem]">
              For every automation, see how many people commented, got the DM, clicked or replied, and became a lead.
              Tracked short links count every click, and the busiest-times chart shows when your audience comments most.
            </SectionText>
          </div>
          <AnalyticsVisual className="mt-10 lg:col-start-2 lg:row-start-2" />
        </Container>
      </section>

      {/* Meta's rules */}
      <section id="meta-rules" className="scroll-mt-14 border-t">
        <Container className="grid gap-x-16 gap-y-10 py-20 sm:py-28 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <SectionTitle>Working within Meta’s rules</SectionTitle>
              <SectionText className="mt-4">
                Instagram and Facebook limit what automated messages can do. {brand.name} uses Meta’s official API and
                applies these rules for you. This is what they mean in practice.
              </SectionText>
            </div>
          </div>
          <dl className="border-t lg:col-span-8">
            {metaRules.map((rule) => (
              <div key={rule.term} className="grid gap-1.5 border-b py-6 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-8">
                <dt className="text-[15px] font-medium leading-[1.65] text-foreground">{rule.term}</dt>
                <dd className="text-[15px] leading-[1.65] text-muted-foreground">{rule.body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Pricing summary */}
      <section id="pricing" className="scroll-mt-14 border-t">
        <Container className="py-20 sm:py-28">
          <SectionTitle>Pricing</SectionTitle>
          <SectionText className="mt-4 max-w-2xl">
            Start on Free with {free.channels === 1 ? "one account" : plural(free.channels, "account", "accounts")} and{" "}
            {count(free.dmsPerMonth)} DMs a month. Paid plans add accounts, DMs, teammates and broadcasts. Every plan
            includes automations, the inbox, contacts, tracked links and analytics.
          </SectionText>

          <div className="mt-12 hidden sm:block">
            <table className="w-full border-t text-left">
              <caption className="sr-only">Plans and their monthly limits</caption>
              <thead>
                <tr className="border-b text-[13px] text-muted-foreground">
                  <th scope="col" className="py-3 pr-4 font-normal">
                    Plan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">
                    Per month
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">
                    Accounts
                  </th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-normal md:table-cell">
                    Automations
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">
                    DMs a month
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">
                    Team members
                  </th>
                  <th scope="col" className="py-3 pl-4 text-right font-normal">
                    Broadcasts
                  </th>
                </tr>
              </thead>
              <tbody className="text-[15px] tabular-nums">
                {PLAN_ORDER.map((tier) => {
                  const plan = PLANS[tier];
                  return (
                    <tr key={tier} className="border-b">
                      <th scope="row" className="py-4 pr-4 font-medium text-foreground">
                        {plan.label}
                      </th>
                      <td className="px-4 py-4 text-right">${plan.priceUsd}</td>
                      <td className="px-4 py-4 text-right">{count(plan.channels)}</td>
                      <td className="hidden px-4 py-4 text-right md:table-cell">{count(plan.automations)}</td>
                      <td className="px-4 py-4 text-right">{count(plan.dmsPerMonth)}</td>
                      <td className="px-4 py-4 text-right">{count(plan.members)}</td>
                      <td className="py-4 pl-4 text-right">
                        {plan.broadcasts ? (
                          <Check role="img" aria-label="Included" className="ml-auto size-4" strokeWidth={2.25} />
                        ) : (
                          <Minus role="img" aria-label="Not included" className="ml-auto size-4 text-muted-foreground" strokeWidth={2} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="mt-10 border-t sm:hidden">
            {PLAN_ORDER.map((tier) => {
              const plan = PLANS[tier];
              return (
                <li key={tier} className="border-b py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[16px] font-medium">{plan.label}</p>
                    <p className="text-[16px] tabular-nums">
                      ${plan.priceUsd}
                      <span className="text-[13px] text-muted-foreground"> a month</span>
                    </p>
                  </div>
                  <p className="mt-1 text-[14px] leading-[1.6] text-muted-foreground">
                    {plural(plan.channels, "account", "accounts")}, {count(plan.dmsPerMonth)} DMs a month,{" "}
                    {plural(plan.members, "team member", "team members")}
                    {plan.broadcasts ? ", broadcasts" : ", no broadcasts"}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] text-muted-foreground">
              Prices are in US dollars. Paying yearly costs {annualSavings}% less.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/pricing"
                className="group inline-flex items-center gap-1.5 rounded-sm text-[14px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Compare plans
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </Link>
              <Button asChild>
                <Link href="/login">Start free</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-14 border-t">
        <Container className="grid gap-x-16 gap-y-10 py-20 sm:py-28 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionTitle>Common questions</SectionTitle>
            <SectionText className="mt-4">
              Can’t find your answer? Email{" "}
              <a
                href={`mailto:${brand.supportEmail}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {brand.supportEmail}
              </a>
              .
            </SectionText>
          </div>
          <FaqList items={faqs} className="lg:col-span-8" />
        </Container>
      </section>
    </>
  );
}
