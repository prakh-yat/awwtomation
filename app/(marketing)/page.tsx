import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChartColumn,
  Check,
  GitBranch,
  Inbox,
  Lock,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  Timer,
  UserCheck,
} from "lucide-react";

import { FeatureCard } from "@/components/marketing/feature-card";
import { HeroMock } from "@/components/marketing/hero-mock";
import { Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLAN_ORDER, PLANS } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { cn, formatNumber } from "@/lib/utils";

export const metadata: Metadata = {
  // `absolute` opts out of the root "%s · Brand" template so the brand isn't repeated.
  title: { absolute: `${brand.name} — Turn comments into customers` },
  description: brand.description,
};


const steps = [
  {
    n: "01",
    title: "Connect your account",
    body: "Sign in with Google, then connect an Instagram professional account or a Facebook Page through Meta's official login. No passwords, ever.",
  },
  {
    n: "02",
    title: "Pick a post and a keyword",
    body: "Choose a reel or post (or all of them), set the keyword — \"LINK\", \"GUIDE\", \"PRICE\" — and write the DM. Add buttons, a follow gate or a delay.",
  },
  {
    n: "03",
    title: "Every commenter gets a DM",
    body: `${brand.name} replies privately within seconds, optionally answers publicly under the comment, and tracks every click on the links you send.`,
  },
];

const features = [
  {
    icon: MessageCircle,
    title: "Comment → DM",
    description:
      "Keyword, exact match or every comment. One private reply per comment, sent within seconds, deduplicated so nobody gets spammed.",
  },
  {
    icon: GitBranch,
    title: "Flow builder",
    description:
      "Drag a message, a follow check, a delay or a tag onto the canvas. Buttons branch the conversation. Start from a template or a blank canvas.",
  },
  {
    icon: UserCheck,
    title: "Follow gate",
    description:
      "Ask people to follow before they get the link. We check with Meta and send it the moment they tap \"I'm following\".",
  },
  {
    icon: Inbox,
    title: "Unified inbox",
    description:
      "Instagram and Facebook conversations side by side, with the 24-hour messaging window visible on every thread. Reply as a human when it matters.",
  },
  {
    icon: Megaphone,
    title: "Broadcasts",
    description:
      "Message a tagged audience. Only contacts inside Meta's messaging window are eligible, so your account stays in good standing.",
  },
  {
    icon: ChartColumn,
    title: "Analytics & tracked links",
    description:
      "DMs sent, triggers matched, click-through rate per automation. Every link goes through a short tracked URL you own.",
  },
];

const trust = [
  { icon: ShieldCheck, title: "Official Meta API", body: "Instagram Graph and Messenger APIs, nothing scraped." },
  { icon: Lock, title: "Encrypted tokens", body: "Access tokens are AES-256-GCM encrypted at rest." },
  { icon: Timer, title: "Rules enforced", body: "Rate limits, 24h window and one-reply-per-comment, built in." },
  { icon: Check, title: "Delete on request", body: "Disconnect a channel or ask us and your data is removed." },
];

const faqs = [
  {
    q: "Does this work with a personal Instagram account?",
    a: "No. Meta only allows messaging automation on Instagram professional accounts (Business or Creator) and Facebook Pages. Switching a personal account to a professional one is free and takes a minute in the Instagram app.",
  },
  {
    q: "Is automated messaging allowed by Instagram and Facebook?",
    a: `Yes, when it is done through the official APIs and follows Meta's messaging rules. ${brand.name} sends one private reply per comment, only messages people who interacted with you, respects the 24-hour window and discloses that the first message is automated.`,
  },
  {
    q: "Can I also reply publicly under the comment?",
    a: "Yes. Turn on public replies for an automation and add a few variations — we pick one at random so the thread doesn't look robotic.",
  },
  {
    q: "What counts as a DM on my plan?",
    a: "Every message sent by an automation or broadcast counts toward the monthly limit. Limits reset at the start of each month, and you'll see usage on your billing page before you get near the cap.",
  },
  {
    q: "Do you need my Instagram password?",
    a: `Never. You connect through Meta's login screen, which gives ${brand.name} a scoped access token. You can revoke it at any time from Instagram, Facebook or the Channels page.`,
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-card">
              <PlatformIcon platform="INSTAGRAM" size={13} />
              <PlatformIcon platform="FACEBOOK" size={13} />
              Comment-to-DM automation for Instagram &amp; Facebook
            </p>
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl">
              Turn comments into customers.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-muted-foreground">
              {brand.name} replies to every keyword comment with an instant DM — links, buttons, follow gates and
              tracked clicks — on the official Meta API.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-6">
                <Link href="/login">
                  Get started free
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-6">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Free plan included · No credit card · Connect in 2 minutes</p>
          </div>
          <div className="mt-16">
            <HeroMock />
          </div>
        </div>
      </section>

      {/* How it works */}
      <Section
        id="how-it-works"
        eyebrow="How it works"
        title="Three steps from a comment to a conversation."
        description="Set it up once. It keeps working on every post you choose, day and night."
      >
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative rounded-lg border bg-card p-6 shadow-card">
              <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Features */}
      <Section
        id="features"
        eyebrow="Everything you need"
        title="One tool for the whole comment-to-DM loop."
        description="From the first keyword match to the last click, without stitching five apps together."
        className="border-t bg-muted/30"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
          ))}
        </div>
      </Section>

      {/* Trust strip */}
      <section className="border-y">
        <div className="mx-auto grid w-full max-w-6xl gap-px px-0 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map((t, i) => (
            <div
              key={t.title}
              className={cn(
                "flex items-start gap-3 px-6 py-6",
                i > 0 && "border-t sm:border-t-0",
                i % 2 === 1 && "sm:border-l",
                i > 0 && "lg:border-l",
              )}
            >
              <t.icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <Section
        id="pricing"
        eyebrow="Pricing"
        title="Start free. Upgrade when the DMs do."
        description="Every plan uses the same engine. Limits scale with channels, automations and monthly DMs."
        align="center"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            const highlighted = tier === "PRO";
            return (
              <div
                key={tier}
                className={cn(
                  "flex flex-col rounded-lg border p-6 shadow-card",
                  highlighted ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                <p className="text-sm font-medium">{plan.label}</p>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">${plan.priceUsd}</span>
                  <span className={cn("text-xs", highlighted ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    /month
                  </span>
                </p>
                <ul
                  className={cn(
                    "mt-5 space-y-1.5 text-[13px]",
                    highlighted ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  <li>
                    {plan.channels} {plan.channels === 1 ? "channel" : "channels"}
                  </li>
                  <li>{formatNumber(plan.dmsPerMonth)} DMs / month</li>
                  <li>
                    {plan.automations} {plan.automations === 1 ? "automation" : "automations"}
                  </li>
                  <li>{plan.broadcasts ? "Broadcasts included" : "No broadcasts"}</li>
                </ul>
                <Button
                  asChild
                  size="sm"
                  variant={highlighted ? "secondary" : "outline"}
                  className={cn("mt-6", highlighted && "bg-background text-foreground hover:bg-background/90")}
                >
                  <Link href="/login">Get started</Link>
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          <Link href="/pricing" className="font-medium text-foreground underline-offset-4 hover:underline">
            Compare all plans
          </Link>{" "}
          · Prices in USD, billed monthly.
        </p>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="FAQ" title="Questions, answered." width="narrow" className="border-t">
        <div className="divide-y rounded-lg border">
          {faqs.map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {f.q}
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <Section inverted align="center" className="py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Start turning comments into conversations.
          </h2>
          <p className="mt-4 text-base text-primary-foreground/70">
            Connect an account, pick a keyword and watch the first DM go out in under five minutes.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 h-11 bg-background px-6 text-foreground hover:bg-background/90"
          >
            <Link href="/login">
              Get started free
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
