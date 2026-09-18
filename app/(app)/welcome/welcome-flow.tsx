"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { toast } from "@/components/ui/sonner";
import type { MetaConfigured } from "@/components/channels/connect-buttons";
import { isAnswered, PROFILE_QUESTIONS, USAGE_QUESTIONS, type Answers, type Question } from "@/lib/onboarding/questions";
import { cn } from "@/lib/utils";

import { finishOnboarding, saveAnswers } from "./actions";
import { WelcomeArt, type ArtName } from "./welcome-art";

type Step = { kind: "question"; question: Question } | { kind: "connect" };

const CONNECT_STEP: Step = { kind: "connect" };

function buildSteps(): Step[] {
  return [
    ...PROFILE_QUESTIONS.map((question) => ({ kind: "question" as const, question })),
    CONNECT_STEP,
    ...USAGE_QUESTIONS.map((question) => ({ kind: "question" as const, question })),
  ];
}

function artFor(step: Step, index: number, total: number): ArtName {
  if (step.kind === "connect") return "connect";
  if (index >= total - 1) return "finish";
  return step.question.stage === "profile" ? "start" : "strategy";
}

function heroFor(step: Step, connectedLabel: string | null): { title: string; body?: string } {
  if (step.kind === "connect") {
    return {
      title: "Connect your first account",
      body: "Approve access on Instagram or Facebook and you will come straight back here.",
    };
  }
  if (step.question.stage === "usage" && connectedLabel && step.question.id === "monetization") {
    return { title: `${connectedLabel} is connected`, body: "A few questions and your workspace is set up for it." };
  }
  return { title: step.question.heroTitle, body: step.question.heroBody };
}

function OptionRow({
  option,
  selected,
  multi,
  onToggle,
}: {
  option: Question["options"][number];
  selected: boolean;
  multi: boolean;
  onToggle: () => void;
}) {
  const Icon = option.icon;
  return (
    <li>
      <button
        type="button"
        role={multi ? "checkbox" : "radio"}
        aria-checked={selected}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected ? "border-foreground bg-secondary/50" : "border-border hover:border-foreground/40 hover:bg-secondary/30",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 text-[15px] leading-snug">{option.label}</span>
        <span
          aria-hidden
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center border transition-colors",
            multi ? "rounded-[6px]" : "rounded-full",
            selected ? "border-foreground bg-foreground text-background" : "border-border",
          )}
        >
          {selected ? multi ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-background" /> : null}
        </span>
      </button>
    </li>
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
}

/**
 * The welcome questionnaire.
 *
 * Profile questions come first because they are about the person and the brand
 * and need nothing connected. The channel is connected in the middle, and the
 * usage questions follow it, because every one of them asks about "this
 * account" or "the channel you connected" and would be guesswork before then.
 */
export function WelcomeFlow({ initialAnswers, hasChannel, connectedLabel, configured, connectHrefs }: WelcomeFlowProps) {
  const router = useRouter();
  const steps = React.useMemo(buildSteps, []);
  const connectIndex = steps.findIndex((s) => s.kind === "connect");

  const [answers, setAnswers] = React.useState<Answers>(initialAnswers);
  const [pending, startTransition] = React.useTransition();

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
  const hero = heroFor(step, connectedLabel);

  const canAdvance = step.kind === "connect" ? hasChannel : isAnswered(step.question, answers);

  function toggle(question: Question, value: string) {
    setAnswers((prev) => {
      if (question.kind === "single") return { ...prev, [question.id]: value };
      const current = Array.isArray(prev[question.id]) ? (prev[question.id] as string[]) : [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [question.id]: next };
    });
  }

  function goNext() {
    const snapshot = answers;
    if (isLast) {
      startTransition(async () => {
        try {
          await finishOnboarding(snapshot);
          router.replace("/dashboard");
        } catch {
          toast.error("Could not save your answers. Please try again.");
        }
      });
      return;
    }
    setIndex((i) => Math.min(i + 1, total - 1));
    // Saved in the background: a slow round trip should never hold up the next question.
    void saveAnswers(snapshot).catch(() => undefined);
  }

  function goBack() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  function skip() {
    const snapshot = answers;
    startTransition(async () => {
      try {
        await finishOnboarding(snapshot);
        router.replace("/dashboard");
      } catch {
        toast.error("Could not skip right now. Please try again.");
      }
    });
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,42%)_1fr]">
      <aside className="hidden flex-col justify-between border-r bg-secondary/30 px-12 py-10 lg:flex">
        <span className="flex items-center gap-0.5">
          <LogoMark size={26} />
          <Wordmark height={12} />
        </span>

        <div className="max-w-[26rem]">
          <WelcomeArt name={artFor(step, index, total)} />
          <h2 className="mt-8 text-[clamp(2rem,3vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{hero.title}</h2>
          {hero.body ? <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{hero.body}</p> : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Step {index + 1} of {total}
        </p>
      </aside>

      <section className="flex min-h-screen flex-col px-6 py-8 md:px-12 lg:px-16">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-0.5 lg:hidden">
            <LogoMark size={22} />
            <Wordmark height={10} />
          </span>
          <div aria-hidden className="hidden h-1 flex-1 overflow-hidden rounded-full bg-secondary lg:block">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={skip}
            disabled={pending}
            className="shrink-0 text-[13px] text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-[46rem] flex-1 animate-fade-in flex-col justify-center py-10">
          {step.kind === "connect" ? (
            <>
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">Connect an account to automate</h1>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Automations reply from a connected Instagram professional account or Facebook Page. You can disconnect at any time.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    {
                      platform: "INSTAGRAM" as const,
                      title: "Instagram",
                      href: connectHrefs.instagram,
                      enabled: configured.instagram,
                      points: ["Reply to comments on posts and reels", "Answer DMs and story replies", "Reply publicly under the comment"],
                    },
                    {
                      platform: "FACEBOOK" as const,
                      title: "Facebook Page",
                      href: connectHrefs.facebook,
                      enabled: configured.facebook,
                      points: ["Reply to comments on Page posts", "Answer keyword messages in Messenger", "Reply publicly under the comment"],
                    },
                  ] as const
                ).map((option) => (
                  <div key={option.platform} className="flex flex-col rounded-xl border bg-card p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background">
                      <PlatformIcon platform={option.platform} size={18} />
                    </span>
                    <h2 className="mt-3.5 text-[15px] font-semibold">{option.title}</h2>
                    <ul className="mt-3 flex-1 space-y-1.5 text-[13px] text-muted-foreground">
                      {option.points.map((point) => (
                        <li key={point} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                    {option.enabled ? (
                      <Button asChild className="mt-5 w-full" variant={option.platform === "INSTAGRAM" ? "default" : "outline"}>
                        <a href={option.href}>
                          Connect {option.title}
                          <ArrowRight />
                        </a>
                      </Button>
                    ) : (
                      <Button className="mt-5 w-full" variant="outline" disabled>
                        Unavailable right now
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {hasChannel ? (
                <p className="mt-6 inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                  {connectedLabel ? `${connectedLabel} is connected.` : "An account is connected."} Continue when you are ready.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{step.question.title}</h1>
              {step.question.subtitle ? <p className="mt-2 text-[15px] text-muted-foreground">{step.question.subtitle}</p> : null}

              <ul
                role={step.question.kind === "multi" ? "group" : "radiogroup"}
                aria-label={step.question.title}
                className="mt-8 space-y-2.5"
              >
                {step.question.options.map((option) => {
                  const value = answers[step.question.id];
                  const selected =
                    step.question.kind === "single" ? value === option.value : Array.isArray(value) && value.includes(option.value);
                  return (
                    <OptionRow
                      key={option.value}
                      option={option}
                      selected={selected}
                      multi={step.question.kind === "multi"}
                      onToggle={() => toggle(step.question, option.value)}
                    />
                  );
                })}
              </ul>
              {step.question.kind === "multi" ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Pick as many as apply.</p>
              ) : null}
            </>
          )}
        </div>

        <footer className="mx-auto flex w-full max-w-[46rem] items-center justify-between gap-4">
          {index > 0 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={pending}
              className="inline-flex items-center gap-1 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}
          <Button onClick={goNext} disabled={!canAdvance} loading={pending}>
            {isLast ? "Finish" : "Next"}
          </Button>
        </footer>
      </section>
    </main>
  );
}
