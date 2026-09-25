"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";

import { PlanSwatch } from "@/components/billing/plan-badge";
import { GridLines } from "@/components/layout/grid-block";
import { Button } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/sonner";
import { TONES, type Tone } from "@/components/ui/tone";
import {
  annualSavingsPercent,
  formatUsd,
  intervalSuffix,
  monthlyEquivalentCents,
  PLAN_ORDER,
  PLANS,
  planPriceCents,
  type BillingIntervalId,
} from "@/lib/billing/plans";
import { isAnswered, toggleAnswer, WORKSPACE_QUESTIONS, type Answers, type Question } from "@/lib/onboarding/questions";
import { cn } from "@/lib/utils";

import { finishOnboarding, saveAnswers } from "./actions";
import { WelcomeArt, type ArtName } from "./welcome-art";

type Step = { kind: "question"; question: Question } | { kind: "plan" };

const PLAN_STEP: Step = { kind: "plan" };

function buildSteps(withPlan: boolean): Step[] {
  return [...WORKSPACE_QUESTIONS.map((question) => ({ kind: "question" as const, question })), ...(withPlan ? [PLAN_STEP] : [])];
}

/**
 * The two parts of the flow. Each has a colour and a mark: the left panel fills
 * with the colour and a chosen option is tinted with it, so the part you are in
 * is always clear.
 */
type StageId = "workspace" | "plan";

const STAGES: Record<StageId, { label: string; tone: Tone; art: ArtName }> = {
  workspace: { label: "Your workspace", tone: "yellow", art: "start" },
  plan: { label: "Your plan", tone: "lavender", art: "finish" },
};

function stageOf(step: Step): StageId {
  return step.kind === "plan" ? "plan" : "workspace";
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

function PlanStep({
  plan,
  interval,
  billingConfigured,
  tone,
  onPlan,
  onInterval,
  headingRef,
}: {
  plan: PlanTier;
  interval: BillingIntervalId;
  billingConfigured: boolean;
  tone: Tone;
  onPlan: (tier: PlanTier) => void;
  onInterval: (next: BillingIntervalId) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const savings = Math.min(...PLAN_ORDER.map(annualSavingsPercent));

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

      <p className="mt-4 text-[15px] text-muted-foreground">Set everything up now. Nothing is sent until you pick a plan.</p>

      {!billingConfigured ? (
        <p className="mt-5 rounded-2xl bg-orange-soft px-4 py-3 text-[13px] text-orange-ink">
          Card payments aren&apos;t available right now. You can pick a plan later in Settings.
        </p>
      ) : null}

      <div role="radiogroup" aria-label="Plans" className="mt-6 grid gap-2.5 sm:grid-cols-3">
        {PLAN_ORDER.map((tier) => {
          const limits = PLANS[tier];
          const selected = billingConfigured && plan === tier;
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!billingConfigured}
              onClick={() => onPlan(tier)}
              className={cn(
                cardBase,
                "flex h-full flex-col p-5 disabled:cursor-not-allowed disabled:opacity-45",
                selected ? selectedCard(tone) : "border-border bg-background text-ink enabled:hover:border-ink/35",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <PlanSwatch plan={tier} />
                  <span className="truncate text-[15px] font-semibold">{limits.label}</span>
                </span>
                <ChoiceMark selected={selected} multi={false} />
              </span>
              <span className="mt-1 block text-[13px] text-muted-foreground">{limits.description}</span>

              {/* Priced as on the pricing page: what is charged, and for a year what that is a month. */}
              <span className="mt-5 flex flex-wrap items-baseline gap-x-1">
                <span className="font-display text-[32px] leading-none tabular-nums">{formatUsd(planPriceCents(tier, interval))}</span>
                <span className="text-[13px] font-medium text-muted-foreground">{intervalSuffix(interval)}</span>
              </span>
              {interval === "ANNUAL" ? (
                <span className="mt-1.5 block text-[12px] text-muted-foreground">
                  {formatUsd(monthlyEquivalentCents(tier, interval))} a month, billed yearly
                </span>
              ) : null}

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
function StagePanel({ stage }: { stage: StageId }) {
  const { label, tone, art } = STAGES[stage];
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

      <p key={stage} className="animate-fade-in font-display text-[clamp(3rem,5vw,4.5rem)] leading-[0.9] motion-reduce:animate-none">
        {label}
      </p>
    </aside>
  );
}

export interface WelcomeFlowProps {
  initialAnswers: Answers;
  /**
   * Whether to end on the plan step. Only an owner whose organization has no
   * plan and no subscription chooses one here; everyone else has nothing to decide.
   */
  showPlanStep: boolean;
  /** False when card payments are not configured: the plans are shown but only the dashboard is offered. */
  billingConfigured: boolean;
}

/**
 * The welcome flow: who the workspace is for, then, for an owner who has not
 * subscribed, the plan. Connecting an account is not part of it: that happens
 * on the dashboard, which asks about each account as it is connected.
 */
export function WelcomeFlow({ initialAnswers, showPlanStep, billingConfigured }: WelcomeFlowProps) {
  const router = useRouter();
  const steps = React.useMemo(() => buildSteps(showPlanStep), [showPlanStep]);

  const [answers, setAnswers] = React.useState<Answers>(initialAnswers);
  const [plan, setPlan] = React.useState<PlanTier>(PLAN_ORDER[0]);
  const [interval, setInterval] = React.useState<BillingIntervalId>("MONTHLY");
  const [pending, startTransition] = React.useTransition();
  // Which way out is on its way, so only that button spins.
  const [leaving, setLeaving] = React.useState<"next" | "later" | "skip" | null>(null);
  // Which way the next step slides in from.
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");

  // Resume at the first question without an answer, or at the end when all have one.
  const [index, setIndex] = React.useState(() => {
    const firstUnanswered = steps.findIndex((s) => s.kind === "question" && !isAnswered(s.question, initialAnswers));
    return firstUnanswered === -1 ? steps.length - 1 : firstUnanswered;
  });

  const step = steps[index];
  const total = steps.length;
  const isLast = index === total - 1;
  const stage = stageOf(step);
  const tone = STAGES[stage].tone;
  const offerCheckout = step.kind === "plan" && billingConfigured;

  const canAdvance = step.kind === "plan" ? true : isAnswered(step.question, answers);

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
    setAnswers((prev) => toggleAnswer(question, prev, value));
  }

  /** Finishes the flow (skipped or not) and leaves for `target`. */
  function finish(target: string, way: "next" | "later" | "skip") {
    const snapshot = answers;
    setLeaving(way);
    startTransition(async () => {
      try {
        await finishOnboarding(snapshot);
        router.replace(target);
      } catch {
        setLeaving(null);
        toast.error(way === "skip" ? "Couldn’t skip right now. Try again." : "Couldn’t save your answers. Try again.");
      }
    });
  }

  function goNext() {
    if (isLast) {
      finish(offerCheckout ? `/checkout?tier=${plan.toLowerCase()}&interval=${interval.toLowerCase()}` : "/dashboard", "next");
      return;
    }
    setDirection("forward");
    setIndex((i) => Math.min(i + 1, total - 1));
    // Saved in the background: a slow round trip should never hold up the next step.
    void saveAnswers(answers).catch(() => undefined);
  }

  function goBack() {
    setDirection("back");
    setIndex((i) => Math.max(i - 1, 0));
  }

  const nextLabel = !isLast ? "Continue" : offerCheckout ? "Continue to checkout" : "Go to dashboard";

  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <StagePanel stage={stage} />

      <section className="flex min-h-dvh min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-4 px-5 pt-5 sm:px-10 lg:px-14 lg:pt-9">
          <span className="flex items-center gap-0.5 lg:hidden">
            <LogoMark size={24} />
            <Wordmark height={11} />
          </span>
          {total > 1 ? (
            <div className="order-last flex w-full sm:order-none sm:w-auto sm:flex-1">
              <Progress index={index} total={total} />
            </div>
          ) : null}
          {/* The plan step has its own way out ("Decide later"), so it does not need this one too. */}
          {step.kind === "plan" ? null : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => finish("/dashboard", "skip")}
              disabled={pending}
              loading={leaving === "skip"}
              className="-mr-2 ml-auto text-muted-foreground hover:text-ink"
            >
              Skip for now
            </Button>
          )}
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

            {step.kind === "plan" ? (
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
          {/* With two ways forward, a phone puts the main one on its own row. */}
          <div className="mx-auto flex w-full max-w-[46rem] flex-wrap items-center gap-x-3 gap-y-2.5">
            {index > 0 ? (
              <Button variant="ghost" onClick={goBack} disabled={pending} className="-ml-3">
                <ChevronLeft />
                Back
              </Button>
            ) : null}
            {offerCheckout ? (
              <Button variant="outline" size="lg" onClick={() => finish("/dashboard", "later")} disabled={pending} loading={leaving === "later"} className="ml-auto">
                Decide later
              </Button>
            ) : null}
            <Button
              size="lg"
              onClick={goNext}
              disabled={!canAdvance || pending}
              loading={leaving === "next"}
              className={offerCheckout ? "max-sm:w-full" : "ml-auto"}
            >
              {nextLabel}
              {isLast || leaving === "next" ? null : <ArrowRight />}
            </Button>
          </div>
        </footer>
      </section>
    </main>
  );
}
