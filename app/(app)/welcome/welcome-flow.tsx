"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft } from "lucide-react";

import type { MetaConfigured } from "@/components/channels/connect-buttons";
import { GridLines } from "@/components/layout/grid-block";
import { Button } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { PLATFORM_TONE } from "@/components/ui/platform-badge";
import { PlatformIcon, type PlatformIconPlatform } from "@/components/ui/platform-icon";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/sonner";
import { TONES, type Tone } from "@/components/ui/tone";
import {
  annualSavingsPercent,
  formatUsd,
  intervalSuffix,
  PLAN_ORDER,
  PLANS,
  planPriceCents,
  PURCHASABLE_PLANS,
  type BillingIntervalId,
} from "@/lib/billing/plans";
import { isAnswered, PROFILE_QUESTIONS, USAGE_QUESTIONS, type Answers, type Question } from "@/lib/onboarding/questions";
import { cn } from "@/lib/utils";

import { finishOnboarding, saveAnswers } from "./actions";
import { WelcomeArt, type ArtName } from "./welcome-art";

type Step = { kind: "question"; question: Question } | { kind: "connect" } | { kind: "plan" };

const CONNECT_STEP: Step = { kind: "connect" };
const PLAN_STEP: Step = { kind: "plan" };

function buildSteps(withPlan: boolean): Step[] {
  return [
    ...PROFILE_QUESTIONS.map((question) => ({ kind: "question" as const, question })),
    CONNECT_STEP,
    ...USAGE_QUESTIONS.map((question) => ({ kind: "question" as const, question })),
    ...(withPlan ? [PLAN_STEP] : []),
  ];
}

/**
 * The four parts of the flow. Each has a colour: the left panel fills with it
 * and a chosen option is tinted with it, so the part you are in is always clear.
 */
type StageId = "profile" | "connect" | "usage" | "plan";

const STAGES: Record<StageId, { label: string; tone: Tone }> = {
  profile: { label: "About you", tone: "yellow" },
  connect: { label: "Connect", tone: "ink" },
  usage: { label: "Your account", tone: "purple" },
  plan: { label: "Your plan", tone: "lavender" },
};

function stageOf(step: Step): StageId {
  return step.kind === "question" ? step.question.stage : step.kind;
}

function artFor(step: Step, index: number, total: number): ArtName {
  if (step.kind === "connect") return "connect";
  if (step.kind === "plan") return "finish";
  if (index >= total - 1) return "finish";
  return step.question.stage === "profile" ? "start" : "strategy";
}

/** A chosen card: an ink edge (drawn inside, so nothing shifts) on the stage's soft tint. */
function selectedCard(tone: Tone): string {
  return cn("border-ink shadow-[inset_0_0_0_1px_hsl(var(--brand-ink))]", TONES[tone].soft, "text-ink");
}

const cardBase = cn(
  "relative w-full rounded-2xl border text-left",
  "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-soft active:scale-[0.98]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

/** Round for one answer, square for several; ticked in ink when chosen. */
function ChoiceMark({ selected, multi, className }: { selected: boolean; multi: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors duration-200",
        multi ? "rounded-md" : "rounded-full",
        selected ? "border-ink bg-ink text-white" : "border-ink/20 bg-background",
        className,
      )}
    >
      {selected ? <Check className="h-3 w-3 animate-pop motion-reduce:animate-none" strokeWidth={3.5} /> : null}
    </span>
  );
}

function StepHeading({ headingRef, children }: { headingRef: React.Ref<HTMLHeadingElement>; children: React.ReactNode }) {
  return (
    <h1 ref={headingRef} tabIndex={-1} className="font-display text-[30px] leading-[1.02] text-balance outline-none sm:text-[40px]">
      {children}
    </h1>
  );
}

function OptionCard({
  option,
  selected,
  multi,
  tall,
  tone,
  onToggle,
}: {
  option: Question["options"][number];
  selected: boolean;
  multi: boolean;
  /** Three options or fewer: tall tiles in a row from `sm` up. */
  tall: boolean;
  tone: Tone;
  onToggle: () => void;
}) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        cardBase,
        "group flex items-center gap-3.5 p-3.5",
        tall && "sm:h-full sm:min-h-[148px] sm:flex-col sm:items-start sm:justify-between sm:gap-6 sm:p-5",
        selected ? selectedCard(tone) : "border-border bg-background text-ink hover:border-ink/35 hover:bg-fog/60",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
          selected ? TONES[tone].solid : "bg-fog text-ink group-hover:bg-background",
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className={cn("min-w-0 flex-1 text-[15px] font-semibold leading-snug", tall && "sm:flex-none sm:pr-6")}>{option.label}</span>
      <ChoiceMark selected={selected} multi={multi} className={tall ? "sm:absolute sm:right-4 sm:top-4" : undefined} />
    </button>
  );
}

function QuestionStep({
  question,
  answers,
  tone,
  onToggle,
  headingRef,
}: {
  question: Question;
  answers: Answers;
  tone: Tone;
  onToggle: (question: Question, value: string) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const multi = question.kind === "multi";
  const tall = question.options.length <= 3;
  const value = answers[question.id];

  return (
    <>
      <StepHeading headingRef={headingRef}>{question.title}</StepHeading>
      <p className="brand-label mt-4 text-muted-foreground">{multi ? "Choose all that apply" : "Choose one"}</p>
      <div
        role={multi ? "group" : "radiogroup"}
        aria-label={question.title}
        className={cn("mt-6 grid gap-2.5", tall ? "sm:grid-cols-3" : "sm:grid-cols-2")}
      >
        {question.options.map((option) => (
          <OptionCard
            key={option.value}
            option={option}
            selected={multi ? Array.isArray(value) && value.includes(option.value) : value === option.value}
            multi={multi}
            tall={tall}
            tone={tone}
            onToggle={() => onToggle(question, option.value)}
          />
        ))}
      </div>
    </>
  );
}

const CONNECT_TILES: ReadonlyArray<{ platform: PlatformIconPlatform; name: string; detail: string; action: string }> = [
  { platform: "INSTAGRAM", name: "Instagram", detail: "Comments, DMs and story replies", action: "Connect Instagram" },
  { platform: "FACEBOOK", name: "Messenger", detail: "Facebook Page comments and Messenger", action: "Connect Facebook Page" },
];

function ConnectStep({
  configured,
  connectHrefs,
  hasChannel,
  connectedLabel,
  headingRef,
}: {
  configured: MetaConfigured;
  connectHrefs: { instagram: string; facebook: string };
  hasChannel: boolean;
  connectedLabel: string | null;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <>
      <StepHeading headingRef={headingRef}>Connect an account</StepHeading>
      <p className="mt-4 text-[15px] text-muted-foreground">Instagram needs a professional account.</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {CONNECT_TILES.map((tile) => {
          const instagram = tile.platform === "INSTAGRAM";
          const enabled = instagram ? configured.instagram : configured.facebook;
          const shell = cn("group flex min-h-[208px] flex-col rounded-3xl p-5 sm:min-h-[236px]", PLATFORM_TONE[tile.platform].tile);
          const body = (
            <>
              <span className="flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <PlatformIcon platform={tile.platform} size={24} />
                </span>
                {enabled ? (
                  <ArrowUpRight
                    aria-hidden
                    className="h-5 w-5 opacity-70 transition-[transform,opacity] duration-200 ease-soft group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none"
                  />
                ) : null}
              </span>
              <span className="mt-auto block pt-8">
                <span className="block font-display text-[30px] leading-none">{tile.name}</span>
                <span className="mt-2 block text-[13px] opacity-85">{tile.detail}</span>
              </span>
              <span className="mt-5 flex h-10 items-center justify-center rounded-full bg-white px-4 text-[14px] font-semibold text-ink">
                {enabled ? tile.action : "Unavailable right now"}
              </span>
            </>
          );
          // Plain anchors: the targets are route handlers that redirect to Meta.
          return enabled ? (
            <a
              key={tile.platform}
              href={instagram ? connectHrefs.instagram : connectHrefs.facebook}
              className={cn(shell, "lift outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
            >
              {body}
            </a>
          ) : (
            <div key={tile.platform} aria-disabled="true" className={cn(shell, "opacity-45")}>
              {body}
            </div>
          );
        })}
      </div>

      {hasChannel ? (
        <p className="mt-6 flex items-center gap-2.5 text-[14px] font-semibold">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
          </span>
          {connectedLabel ? `${connectedLabel} is connected` : "Your account is connected"}
        </p>
      ) : null}
    </>
  );
}

function PlanStep({
  plan,
  interval,
  billingConfigured,
  tone,
  onPlan,
  onInterval,
  headingRef,
}: {
  plan: PlanTier | null;
  interval: BillingIntervalId;
  billingConfigured: boolean;
  tone: Tone;
  onPlan: (tier: PlanTier) => void;
  onInterval: (next: BillingIntervalId) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const savings = Math.min(...PURCHASABLE_PLANS.map(annualSavingsPercent));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <StepHeading headingRef={headingRef}>Pick a plan</StepHeading>
        <Segmented
          aria-label="Billing interval"
          size="sm"
          value={interval}
          onChange={onInterval}
          options={[
            { value: "MONTHLY", label: "Monthly" },
            { value: "ANNUAL", label: savings > 0 ? `Annual, save ${savings}%` : "Annual" },
          ]}
          className="sm:w-[280px]"
        />
      </div>

      {!billingConfigured ? (
        <p className="mt-5 rounded-2xl bg-orange-soft px-4 py-3 text-[13px] text-orange-ink">
          Card payments are off for now, so only Free can be started here.
        </p>
      ) : null}

      <div role="radiogroup" aria-label="Plans" className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {PLAN_ORDER.map((tier) => {
          const limits = PLANS[tier];
          const selected = plan === tier;
          const disabled = tier !== "FREE" && !billingConfigured;
          const cents = planPriceCents(tier, interval);
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onPlan(tier)}
              className={cn(
                cardBase,
                "flex h-full flex-col p-5 disabled:cursor-not-allowed disabled:opacity-45",
                selected ? selectedCard(tone) : "border-border bg-background text-ink enabled:hover:border-ink/35",
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{limits.label}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{limits.description}</span>
                </span>
                <ChoiceMark selected={selected} multi={false} />
              </span>

              <span className="mt-5 block font-display text-[32px] leading-none">
                {cents === 0 ? "Free" : formatUsd(cents)}
                {cents === 0 ? null : (
                  <span className="ml-1 font-sans text-[13px] font-medium tracking-normal text-muted-foreground">{intervalSuffix(interval)}</span>
                )}
              </span>

              <span className="mt-4 block space-y-1.5 text-[13px] text-muted-foreground">
                {limits.features.slice(0, 4).map((feature) => (
                  <span key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
                    <span>{feature}</span>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** One segment per step, filling in ink as you go. */
function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-valuetext={`Step ${index + 1} of ${total}`}
        className="flex min-w-0 flex-1 items-center gap-1"
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/10">
            <span
              className={cn(
                "block h-full w-full origin-left rounded-full bg-ink transition-transform duration-500 ease-soft motion-reduce:transition-none",
                i <= index ? "scale-x-100" : "scale-x-0",
              )}
            />
          </span>
        ))}
      </div>
      <span aria-hidden className="brand-label shrink-0 tabular-nums text-muted-foreground">
        {index + 1}/{total}
      </span>
    </div>
  );
}

/** The colour block on the left from `lg` up: the part of the flow you are in, and its mark. */
function StagePanel({ stage, art, connectedLabel }: { stage: StageId; art: ArtName; connectedLabel: string | null }) {
  const { label, tone } = STAGES[stage];
  return (
    <aside
      className={cn(
        "sticky top-0 isolate hidden h-dvh flex-col justify-between self-start overflow-hidden px-12 py-10 lg:flex",
        "transition-[background-color,color] duration-500 ease-soft motion-reduce:transition-none",
        TONES[tone].solid,
      )}
    >
      <GridLines tone={tone} size="clamp(64px, 6vw, 96px)" />
      <span className="flex items-center gap-0.5">
        <LogoMark size={28} className="text-current" />
        <Wordmark height={13} className="text-current" />
      </span>

      <div key={art} className="flex animate-pop justify-center motion-reduce:animate-none">
        <WelcomeArt name={art} />
      </div>

      <div key={stage} className="animate-fade-in motion-reduce:animate-none">
        <p className="font-display text-[clamp(3rem,5vw,4.5rem)] leading-[0.9]">{label}</p>
        {stage === "usage" && connectedLabel ? (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-ink">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
            {connectedLabel} connected
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export interface WelcomeFlowProps {
  initialAnswers: Answers;
  hasChannel: boolean;
  /** Handle or name of the connected account, for the copy after the connect step. */
  connectedLabel: string | null;
  configured: MetaConfigured;
  /** Where the connect buttons point, keyed by platform. */
  connectHrefs: { instagram: string; facebook: string };
  /**
   * Whether to end on the plan step. Owners without a subscription choose the
   * organization's plan here; an invited member has no business doing that.
   */
  showPlanStep: boolean;
  /** False when card payments are not configured, which disables the paid cards. */
  billingConfigured: boolean;
}

/**
 * The welcome questionnaire.
 *
 * Profile questions come first because they are about the person and the brand
 * and need nothing connected. The channel is connected in the middle, and the
 * usage questions follow it, because every one of them asks about "this
 * account" or "the channel you connected" and would be guesswork before then.
 */
export function WelcomeFlow({
  initialAnswers,
  hasChannel,
  connectedLabel,
  configured,
  connectHrefs,
  showPlanStep,
  billingConfigured,
}: WelcomeFlowProps) {
  const router = useRouter();
  const steps = React.useMemo(() => buildSteps(showPlanStep), [showPlanStep]);
  const connectIndex = steps.findIndex((s) => s.kind === "connect");

  const [answers, setAnswers] = React.useState<Answers>(initialAnswers);
  const [plan, setPlan] = React.useState<PlanTier | null>(null);
  const [interval, setInterval] = React.useState<BillingIntervalId>("MONTHLY");
  const [pending, startTransition] = React.useTransition();
  // Which way the next step slides in from.
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");

  // Resume where the flow actually is: at the connect step until a channel
  // exists, then at the first usage question that has no answer yet.
  const [index, setIndex] = React.useState(() => {
    if (!hasChannel) {
      const firstUnanswered = PROFILE_QUESTIONS.findIndex((q) => !isAnswered(q, initialAnswers));
      return firstUnanswered === -1 ? connectIndex : firstUnanswered;
    }
    const firstUnanswered = USAGE_QUESTIONS.findIndex((q) => !isAnswered(q, initialAnswers));
    return connectIndex + 1 + (firstUnanswered === -1 ? USAGE_QUESTIONS.length - 1 : firstUnanswered);
  });

  const step = steps[index];
  const total = steps.length;
  const isLast = index === total - 1;
  const stage = stageOf(step);
  const tone = STAGES[stage].tone;

  const canAdvance =
    step.kind === "connect" ? hasChannel : step.kind === "plan" ? plan !== null : isAnswered(step.question, answers);

  // A new step moves focus to its question, so keyboard and screen reader users
  // start there, and puts the page back at the top on small screens.
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const shownIndex = React.useRef(index);
  React.useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [index]);

  function toggle(question: Question, value: string) {
    setAnswers((prev) => {
      if (question.kind === "single") return { ...prev, [question.id]: value };
      const current = Array.isArray(prev[question.id]) ? (prev[question.id] as string[]) : [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [question.id]: next };
    });
  }

  /** Where finishing lands: checkout for a paid plan, the dashboard otherwise. */
  function destination(): string {
    if (!showPlanStep || plan === null || plan === "FREE") return "/dashboard";
    return `/checkout?tier=${plan.toLowerCase()}&interval=${interval.toLowerCase()}`;
  }

  function goNext() {
    const snapshot = answers;
    if (isLast) {
      const target = destination();
      startTransition(async () => {
        try {
          await finishOnboarding(snapshot);
          router.replace(target);
        } catch {
          toast.error("Couldn’t save your answers. Try again.");
        }
      });
      return;
    }
    setDirection("forward");
    setIndex((i) => Math.min(i + 1, total - 1));
    // Saved in the background: a slow round trip should never hold up the next question.
    void saveAnswers(snapshot).catch(() => undefined);
  }

  function goBack() {
    setDirection("back");
    setIndex((i) => Math.max(i - 1, 0));
  }

  function skip() {
    const snapshot = answers;
    startTransition(async () => {
      try {
        await finishOnboarding(snapshot);
        router.replace("/dashboard");
      } catch {
        toast.error("Couldn’t skip right now. Try again.");
      }
    });
  }

  const nextLabel = !isLast ? "Continue" : destination().startsWith("/checkout") ? "Continue to checkout" : "Go to dashboard";

  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <StagePanel stage={stage} art={artFor(step, index, total)} connectedLabel={connectedLabel} />

      <section className="flex min-h-dvh min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-4 px-5 pt-5 sm:px-10 lg:px-14 lg:pt-9">
          <span className="flex items-center gap-0.5 lg:hidden">
            <LogoMark size={24} />
            <Wordmark height={11} />
          </span>
          <div className="order-last flex w-full sm:order-none sm:w-auto sm:flex-1">
            <Progress index={index} total={total} />
          </div>
          <Button variant="ghost" size="sm" onClick={skip} disabled={pending} className="-mr-2 ml-auto text-muted-foreground hover:text-ink">
            Skip for now
          </Button>
        </header>

        {/* `clip` rather than `hidden`, so the sliding step never adds a scrollbar and the footer can still stick. */}
        <div className="flex flex-1 flex-col overflow-x-clip px-5 sm:px-10 lg:px-14">
          <div
            key={index}
            className={cn(
              "mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center py-8 sm:py-12",
              direction === "forward" ? "animate-slide-in-right" : "animate-slide-in-left",
              "motion-reduce:animate-none",
            )}
          >
            <span className={cn("brand-label mb-5 inline-flex self-start rounded-full px-2.5 py-1 lg:hidden", TONES[tone].solid)}>
              {STAGES[stage].label}
            </span>

            {step.kind === "connect" ? (
              <ConnectStep
                configured={configured}
                connectHrefs={connectHrefs}
                hasChannel={hasChannel}
                connectedLabel={connectedLabel}
                headingRef={headingRef}
              />
            ) : step.kind === "plan" ? (
              <PlanStep
                plan={plan}
                interval={interval}
                billingConfigured={billingConfigured}
                tone={tone}
                onPlan={setPlan}
                onInterval={setInterval}
                headingRef={headingRef}
              />
            ) : (
              <QuestionStep question={step.question} answers={answers} tone={tone} onToggle={toggle} headingRef={headingRef} />
            )}
          </div>
        </div>

        <footer className="sticky bottom-0 z-10 border-t bg-background/90 px-5 py-3.5 backdrop-blur-md sm:px-10 lg:border-t-0 lg:px-14 lg:py-7">
          <div className="mx-auto flex w-full max-w-[46rem] items-center justify-between gap-3">
            {index > 0 ? (
              <Button variant="ghost" onClick={goBack} disabled={pending} className="-ml-3">
                <ChevronLeft />
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button size="lg" onClick={goNext} disabled={!canAdvance} loading={pending}>
              {nextLabel}
              {isLast || pending ? null : <ArrowRight />}
            </Button>
          </div>
        </footer>
      </section>
    </main>
  );
}
