import type { Metadata } from "next";
import Link from "next/link";

import { AnalyticsVisual } from "@/components/marketing/analytics-visual";
import { BroadcastVisual } from "@/components/marketing/broadcast-visual";
import { type FaqItem, FaqList } from "@/components/marketing/faq";
import { FlowVisual } from "@/components/marketing/flow-visual";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { InboxVisual } from "@/components/marketing/inbox-visual";
import { count, plural, RECOMMENDED_PLAN, Tick } from "@/components/marketing/plans";
import { Band, Container, Eyebrow, SectionText, SectionTitle } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { PlatformMark } from "@/components/ui/platform-badge";
import { annualSavingsPercent, PLAN_ORDER, PLANS, PURCHASABLE_PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  // `absolute` opts out of the root "%s · Brand" template so the brand isn't repeated.
  title: { absolute: `${brand.name} · Comment-to-DM automation for Instagram and Facebook` },
  description: brand.description,
};

const free = PLANS.FREE;
const annualSavings = Math.min(...PURCHASABLE_PLANS.map(annualSavingsPercent));

/** An outline pill for a colour block: ink line, fills with ink on hover. */
const outlineOnColour = "border-ink bg-transparent hover:border-ink hover:bg-ink hover:text-white";

const automationOptions: Array<{ term: string; body: string }> = [
  {
    term: "Keywords",
    body: "A word anywhere in the comment, only the exact word, or every comment. You can list words to skip, too.",
  },
  {
    term: "Public replies",
    body: "Write a few short replies. Each comment gets one at random, so the thread doesn’t look copy-pasted.",
  },
  {
    term: "Follow check",
    body: "Send the link only to people who follow you. Everyone else gets a button to tap once they do.",
  },
  {
    term: "More steps",
    body: "Ask a question, wait, add a tag or let AI reply with your own provider key. Start from a comment, a DM or a story reply.",
  },
];

const teamNotes: Array<{ title: string; body: string }> = [
  {
    title: "Contacts",
    body: "Everyone who comments, messages you or replies to a story becomes a contact. Move people through your own stages, like New, Lead and Customer, by hand or from an automation. Add owners, tags and notes, save segments and import a CSV.",
  },
  {
    title: "Teams and workspaces",
    body: "Invite teammates as admins or members and assign conversations to them. Run several brands or clients as workspaces under one plan, or give a client its own organization and billing.",
  },
];

const metaRules: Array<{ term: string; body: string }> = [
  {
    term: "A professional account",
    body: "Instagram Business or Creator accounts and Facebook Pages. Switching a personal Instagram account to professional is free.",
  },
  {
    term: "One private reply per comment",
    body: "Meta allows one private reply to each comment on your own posts, within 7 days. By default, a person gets each automation’s message once, even if they comment again.",
  },
  {
    term: "The 24-hour window",
    body: "Once someone messages you or taps a button, you can message them for 24 hours. Broadcasts only reach people inside it. After it closes, your team can still reply from the inbox for up to 7 days.",
  },
  {
    term: "Hourly sending limits",
    body: "Meta limits private replies per account per hour. On a busy post, replies wait and go out as the limit resets. Anything still waiting after 6 hours is logged as skipped.",
  },
  {
    term: "Meta’s login, not your password",
    body: "You connect through Meta’s own login screen, so we never see your password. Access tokens are encrypted at rest, and you can disconnect at any time.",
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
    answer: `No. You connect through Meta’s login screen, which gives ${brand.name} limited access to the account. You can remove that access at any time from your dashboard or from your Instagram or Facebook settings.`,
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
        workspace or your whole organization for good. The <Link href="/data-deletion">data deletion page</Link> lists
        exactly what each option removes.
      </>
    ),
  },
];

function RecommendedPill() {
  return (
    <span className="brand-label ml-2.5 inline-block rounded-full bg-ink px-2 py-1 align-middle text-[10px] font-medium leading-none text-white">
      Recommended
    </span>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <Band tone="yellow" grid>
        <Container className="grid items-center gap-x-10 gap-y-14 pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div>
            <Eyebrow className="flex items-center gap-2.5">
              <span className="flex items-center gap-1">
                <PlatformMark platform="INSTAGRAM" size={22} aria-hidden />
                <PlatformMark platform="FACEBOOK" size={22} aria-hidden />
              </span>
              Instagram and Messenger
            </Eyebrow>
            <h1 className="mt-6 max-w-[12ch] text-balance font-display text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.86] tracking-[-0.04em]">
              Turn comments into DMs.
            </h1>
            <p className="mt-6 max-w-[31rem] text-pretty text-[17px] leading-[1.5] text-ink/75 sm:text-[19px]">
              Pick a post and a keyword. {brand.name} sends everyone who comments it a private message with your link,
              replies under their comment and saves them as a contact.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className={outlineOnColour}>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="brand-label mt-5 text-ink/70">Free plan, no card needed</p>
          </div>
          <div className="rise" style={{ "--i": 2 } as React.CSSProperties}>
            <HeroVisual />
          </div>
        </Container>
      </Band>

      {/* One comment, start to finish */}
      <Band id="how-it-works" className="scroll-mt-16">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
            <div className="lg:col-span-7">
              <Eyebrow className="text-muted-foreground">How it works</Eyebrow>
              <SectionTitle className="mt-4">One comment, start to finish</SectionTitle>
            </div>
            <SectionText className="lg:col-span-5">
              Himalayan Threads runs this automation on two autumn collection posts. This is what it did when Sita Rai
              commented on the reel.
            </SectionText>
          </div>
          <FlowVisual className="mt-12" />
          <dl className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {automationOptions.map((o, i) => (
              <div key={o.term} className="border-t pt-5">
                <dt className="flex items-baseline gap-2.5 text-[16px] font-bold">
                  <span className="font-mono text-[12px] font-normal text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {o.term}
                </dt>
                <dd className="mt-2 text-[15px] leading-[1.6] text-muted-foreground">{o.body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </Band>

      {/* Inbox and contacts */}
      <Band id="inbox" tone="purple" grid className="scroll-mt-16">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
            <div className="lg:col-span-7">
              <Eyebrow className="text-white/80">Inbox and contacts</Eyebrow>
              <SectionTitle className="mt-4">One inbox for Instagram and Messenger</SectionTitle>
            </div>
            <SectionText className="text-white/85 lg:col-span-5">
              When Sita asks about a size, the conversation is waiting. Each thread shows how long you can still reply,
              who is handling it and the notes they left.
            </SectionText>
          </div>
          <InboxVisual className="mt-12" />
          <div className="mt-14 grid gap-10 md:grid-cols-2 md:gap-16">
            {teamNotes.map((note) => (
              <div key={note.title}>
                <h3 className="text-[20px] font-bold tracking-[-0.01em]">{note.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.65] text-white/85">{note.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* Broadcasts and analytics */}
      <Band id="broadcasts" className="scroll-mt-16">
        {/* Text on the first row and pictures on the second, so both pictures start level on wide screens. */}
        <Container className="grid items-start gap-x-10 py-20 sm:py-28 lg:grid-cols-2">
          <div className="lg:col-start-1 lg:row-start-1">
            <SectionTitle className="text-[30px] sm:text-[36px] lg:text-[40px]">Message everyone with a tag</SectionTitle>
            <SectionText className="mt-4 max-w-[31rem]">
              Pick a tag or a saved segment, write one message, and send it now or later. Only people who messaged you
              in the last 24 hours can receive it, and you see how many before you send.
            </SectionText>
          </div>
          <div className="bg-grid mt-8 rounded-[28px] bg-lavender p-3 [--grid-size:40px] sm:p-6 lg:col-start-1 lg:row-start-2 lg:p-8">
            <BroadcastVisual />
          </div>
          <div className="mt-16 lg:col-start-2 lg:row-start-1 lg:mt-0">
            <SectionTitle className="text-[30px] sm:text-[36px] lg:text-[40px]">See what each automation did</SectionTitle>
            <SectionText className="mt-4 max-w-[31rem]">
              For every automation, see how many people commented, got the DM, clicked or replied, and became a lead.
              Tracked short links count every click, and the busiest-times chart shows when your audience comments most.
            </SectionText>
          </div>
          <div className="bg-grid mt-8 rounded-[28px] bg-sky p-3 [--grid-size:40px] sm:p-6 lg:col-start-2 lg:row-start-2 lg:p-8">
            <AnalyticsVisual />
          </div>
        </Container>
      </Band>

      {/* Meta's rules */}
      <Band id="meta-rules" tone="green" grid className="scroll-mt-16">
        <Container className="grid gap-x-16 gap-y-10 py-20 sm:py-28 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <Eyebrow className="text-white/85">Meta’s rules</Eyebrow>
              <SectionTitle className="mt-4">Built on Meta’s official API</SectionTitle>
              <SectionText className="mt-5 text-white/90">
                Instagram and Facebook limit what automated messages can do. {brand.name} applies these rules for you.
              </SectionText>
            </div>
          </div>
          <dl className="border-t border-white/25 lg:col-span-7">
            {metaRules.map((rule) => (
              <div key={rule.term} className="grid gap-1.5 border-b border-white/25 py-6 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-8">
                <dt className="text-[16px] font-bold leading-[1.5]">{rule.term}</dt>
                <dd className="text-[15px] leading-[1.65] text-white/90">{rule.body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </Band>

      {/* Pricing summary */}
      <Band id="pricing" className="scroll-mt-16">
        <Container className="py-20 sm:py-28">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-10">
            <div className="lg:col-span-7">
              <Eyebrow className="text-muted-foreground">Pricing</Eyebrow>
              <SectionTitle className="mt-4">Start free</SectionTitle>
              <SectionText className="mt-5 max-w-xl">
                Free covers {free.channels === 1 ? "one account" : plural(free.channels, "account", "accounts")} and{" "}
                {count(free.dmsPerMonth)} DMs a month, with no card. Paid plans add accounts, DMs, teammates and
                broadcasts. Every plan includes automations, the inbox, contacts, tracked links and analytics.
              </SectionText>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
              <Button asChild size="lg">
                <Link href="/login">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/pricing">Compare plans</Link>
              </Button>
            </div>
          </div>

          <table className="mt-12 hidden w-full border-separate border-spacing-0 text-left md:table">
            <caption className="sr-only">Plans and their monthly limits</caption>
            <thead>
              <tr className="brand-label text-muted-foreground">
                <th scope="col" className="border-b px-3 pb-3 font-normal lg:px-4">
                  Plan
                </th>
                <th scope="col" className="border-b px-3 pb-3 text-right font-normal lg:px-4">
                  Per month
                </th>
                <th scope="col" className="border-b px-3 pb-3 text-right font-normal lg:px-4">
                  Accounts
                </th>
                <th scope="col" className="hidden border-b px-3 pb-3 text-right font-normal lg:table-cell lg:px-4">
                  Automations
                </th>
                <th scope="col" className="border-b px-3 pb-3 text-right font-normal lg:px-4">
                  DMs a month
                </th>
                <th scope="col" className="border-b px-3 pb-3 text-right font-normal lg:px-4">
                  Team members
                </th>
                <th scope="col" className="border-b px-3 pb-3 text-right font-normal lg:px-4">
                  Broadcasts
                </th>
              </tr>
            </thead>
            <tbody className="text-[15px] tabular-nums">
              {PLAN_ORDER.map((tier) => {
                const plan = PLANS[tier];
                const featured = tier === RECOMMENDED_PLAN;
                const cell = cn("border-b px-3 py-4 text-right lg:px-4", featured && "border-transparent bg-yellow font-semibold");
                return (
                  <tr key={tier}>
                    <th scope="row" className={cn(cell, "text-left font-normal", featured && "rounded-l-2xl")}>
                      <span className="font-display text-[20px] tracking-[-0.02em]">{plan.label}</span>
                      {featured ? <RecommendedPill /> : null}
                    </th>
                    <td className={cell}>${plan.priceUsd}</td>
                    <td className={cell}>{count(plan.channels)}</td>
                    <td className={cn(cell, "hidden lg:table-cell")}>{count(plan.automations)}</td>
                    <td className={cell}>{count(plan.dmsPerMonth)}</td>
                    <td className={cell}>{count(plan.members)}</td>
                    <td className={cn(cell, featured && "rounded-r-2xl")}>
                      <Tick included={plan.broadcasts} label={plan.broadcasts ? "Included" : "Not included"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ul className="mt-10 space-y-2 md:hidden">
            {PLAN_ORDER.map((tier) => {
              const plan = PLANS[tier];
              const featured = tier === RECOMMENDED_PLAN;
              return (
                <li key={tier} className={cn("rounded-2xl p-4", featured ? "bg-yellow" : "bg-fog")}>
                  <div className="flex items-baseline justify-between gap-4">
                    <p>
                      <span className="font-display text-[20px] tracking-[-0.02em]">{plan.label}</span>
                      {featured ? <RecommendedPill /> : null}
                    </p>
                    <p className="shrink-0 text-[16px] font-semibold tabular-nums">
                      ${plan.priceUsd}
                      <span className="text-[13px] font-normal text-ink/70"> a month</span>
                    </p>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-[1.55] text-ink/70">
                    {plural(plan.channels, "account", "accounts")}, {count(plan.dmsPerMonth)} DMs a month,{" "}
                    {plural(plan.members, "team member", "team members")}
                    {plan.broadcasts ? ", broadcasts" : ", no broadcasts"}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 text-[13px] text-muted-foreground">
            Prices are in US dollars. Paying yearly costs {annualSavings}% less.
          </p>
        </Container>
      </Band>

      {/* FAQ */}
      <Band id="faq" tone="ink" className="scroll-mt-16">
        <Container className="grid gap-x-16 gap-y-10 py-20 sm:py-28 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionTitle>Common questions</SectionTitle>
            <SectionText className="mt-5 text-white/70">
              Can’t find your answer? Email{" "}
              <a
                href={`mailto:${brand.supportEmail}`}
                className="rounded-sm font-semibold text-white underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {brand.supportEmail}
              </a>
              .
            </SectionText>
          </div>
          <FaqList items={faqs} dark className="lg:col-span-8" />
        </Container>
      </Band>
    </>
  );
}
