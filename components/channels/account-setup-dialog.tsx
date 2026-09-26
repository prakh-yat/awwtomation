"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, X } from "lucide-react";

import { GOAL_STYLE } from "@/components/automations/template-gallery";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformMark } from "@/components/ui/platform-badge";
import { toast } from "@/components/ui/sonner";
import { TONES, type Tone } from "@/components/ui/tone";
import { accountQuestionsFor, GOALS, templateGoalFor, type AccountQuestion } from "@/lib/onboarding/account-questions";
import { isAnswered, toggleAnswer, type Answers, type QuestionOption } from "@/lib/onboarding/questions";
import type { ChannelView } from "@/lib/services/channels";
import { cn, initials } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { channelDisplayName, PLATFORM_LABEL } from "./channel-status";

/** Round for one answer, square for several; ticked in ink when chosen. */
function ChoiceMark({ selected, multi }: { selected: boolean; multi: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors duration-200",
        multi ? "rounded-md" : "rounded-full",
        selected ? "border-ink bg-ink text-white" : "border-ink/20 bg-background",
      )}
    >
      {selected ? <Check className="h-3 w-3 animate-pop motion-reduce:animate-none" strokeWidth={3.5} /> : null}
    </span>
  );
}

function OptionRow({
  option,
  selected,
  multi,
  tone,
  onToggle,
}: {
  option: QuestionOption;
  selected: boolean;
  multi: boolean;
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
        "group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left outline-none",
        "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-soft active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        // The chosen row gets an ink edge drawn inside, so nothing shifts, on its tone's tint.
        selected
          ? cn("border-ink shadow-[inset_0_0_0_1px_hsl(var(--brand-ink))]", TONES[tone].soft, "text-ink")
          : "border-border bg-background text-ink hover:border-ink/35 hover:bg-fog/60",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
          selected ? TONES[tone].solid : "bg-fog text-ink group-hover:bg-background",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{option.label}</span>
      <ChoiceMark selected={selected} multi={multi} />
    </button>
  );
}

/** One segment per question, filling in ink as you go. */
function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-valuetext={`Question ${index + 1} of ${total}`}
        className="flex min-w-0 flex-1 items-center gap-1"
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/10">
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

/**
 * Every question and its current answer, so a save leaves the account exactly
 * as the dialog shows it: the route keeps anything left out, so a cleared
 * answer has to be sent as null or an empty list.
 */
function fullAnswers(questions: readonly AccountQuestion[], answers: Answers): Record<string, string | string[] | null> {
  return Object.fromEntries(questions.map((q) => [q.id, answers[q.id] ?? (q.kind === "multi" ? [] : null)]));
}

/**
 * The saved answers, minus any choice the account is no longer offered (a goal
 * its platform has no templates for), so nothing is picked that cannot be seen.
 */
function offeredAnswers(questions: readonly AccountQuestion[], answers: Answers): Answers {
  const next: Answers = {};
  for (const question of questions) {
    const value = answers[question.id];
    const allowed = new Set(question.options.map((o) => o.value));
    if (typeof value === "string" && allowed.has(value)) next[question.id] = value;
    else if (Array.isArray(value)) {
      const kept = value.filter((v) => allowed.has(v));
      if (kept.length > 0) next[question.id] = kept;
    }
  }
  return next;
}

/** The goal picked first: what the next step opens the template gallery on. */
function firstGoalId(answers: Answers): string | null {
  const goals = answers[GOALS.id];
  return Array.isArray(goals) && goals.length > 0 ? goals[0] : null;
}

export interface AccountSetupDialogProps {
  channel: ChannelView;
  /**
   * `connect`: right after the account was connected. Skipping, or closing the
   * dialog, keeps what was answered and marks the questions done, so they are
   * asked once. `edit`: reopened from the account's menu; closing it leaves
   * the saved answers as they were.
   */
  mode: "connect" | "edit";
  open: boolean;
  /** The dialog is finished with, saved or not. */
  onDone: () => void;
}

/**
 * A few questions about one account: what it is, how it makes money and what it
 * should do first. One question at a time, in the platform's colour: Instagram
 * magenta, a Facebook Page Messenger blue, and the goals narrowed to the ones
 * its platform has templates for. After connecting, the answers lead to the
 * template gallery on the account's first goal.
 */
export function AccountSetupDialog({ channel, mode, open, onDone }: AccountSetupDialogProps) {
  const router = useRouter();
  const name = channelDisplayName(channel);
  const platformTone: Tone = channel.platform === "INSTAGRAM" ? "magenta" : "blue";
  const questions = React.useMemo(() => accountQuestionsFor(channel.setup.goalOptions), [channel.setup.goalOptions]);
  const total = questions.length;

  const [answers, setAnswers] = React.useState<Answers>(() => offeredAnswers(questions, channel.setup.answers));
  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");
  // After the last question: the template suggestion, when a goal was picked.
  const [view, setView] = React.useState<"questions" | "next">("questions");
  const [saving, setSaving] = React.useState(false);

  // Reopening (Edit details) starts again from what is saved.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAnswers(offeredAnswers(questions, channel.setup.answers));
      setIndex(0);
      setDirection("forward");
      setView("questions");
    }
  }

  const question: AccountQuestion = questions[index];
  const multi = question.kind === "multi";
  const isLast = index === total - 1;
  const value = answers[question.id];
  const headingId = React.useId();

  // Each new question (and the last view) takes focus, so keyboard and screen reader users start there.
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const shown = React.useRef(`${index}:${view}`);
  React.useEffect(() => {
    const key = `${index}:${view}`;
    if (shown.current === key) return;
    shown.current = key;
    headingRef.current?.focus({ preventScroll: true });
  }, [index, view]);

  /** Saves the answers as shown and marks the questions done, whether they were finished or skipped. */
  function save() {
    return apiFetch<{ channel: ChannelView }>(`/api/channels/${channel.id}/setup`, {
      method: "PATCH",
      body: JSON.stringify({ answers: fullAnswers(questions, answers), complete: true }),
    });
  }

  async function next() {
    if (!isLast) {
      setDirection("forward");
      setIndex((i) => Math.min(i + 1, total - 1));
      return;
    }
    setSaving(true);
    try {
      await save();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save these answers"));
      setSaving(false);
      return;
    }
    setSaving(false);
    router.refresh();
    if (mode === "connect" && templateGoalFor(firstGoalId(answers))) {
      setView("next");
      return;
    }
    toast.success(`Saved details for ${name}`);
    onDone();
  }

  function back() {
    setDirection("back");
    setIndex((i) => Math.max(i - 1, 0));
  }

  /**
   * Keeps whatever was answered and stops asking. It closes straight away: if
   * the save fails, the questions simply come back the next time this account
   * is connected, which is not worth an error.
   */
  function skip() {
    onDone();
    save().then(
      () => router.refresh(),
      () => undefined,
    );
  }

  function handleOpenChange(next: boolean) {
    if (next || saving) return;
    if (view === "questions" && mode === "connect") skip();
    else onDone();
  }

  const goalId = view === "next" ? firstGoalId(answers) : null;
  const goal = templateGoalFor(goalId);
  const goalStyle = goal ? GOAL_STYLE[goal] : null;
  const GoalIcon = goalStyle?.icon;
  // The gallery opens on this account's platform, filtered to the goal.
  const templatesHref = `/automations?${new URLSearchParams({
    templates: "1",
    goal: goalId ?? "",
    platform: channel.platform === "INSTAGRAM" ? "instagram" : "messenger",
  })}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-[30rem]"
        onOpenAutoFocus={(event) => {
          // Start on the question, not on the first button in the header.
          event.preventDefault();
          headingRef.current?.focus({ preventScroll: true });
        }}
      >
        {/* Just connected: the header wears the platform's colour and says so. */}
        <DialogHeader className={cn("flex-row items-center gap-3 space-y-0 border-b px-5 py-4 sm:px-6", mode === "connect" && TONES[platformTone].soft)}>
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10 border">
              {channel.avatarUrl ? <AvatarImage src={channel.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
              <AvatarFallback className="text-[12px]">{initials(channel.name ?? channel.username, channel.platform[0])}</AvatarFallback>
            </Avatar>
            <PlatformMark aria-hidden platform={channel.platform} size={16} className="absolute -bottom-1 -right-1 ring-2 ring-background" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate pr-0 font-sans text-[15px] font-semibold leading-tight tracking-normal text-ink">{name}</DialogTitle>
            {mode === "connect" ? (
              <DialogDescription className={cn("mt-0.5 flex items-center gap-1 text-[12px] font-medium", TONES[platformTone].text)}>
                <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />
                {PLATFORM_LABEL[channel.platform]} connected
              </DialogDescription>
            ) : (
              <DialogDescription className="mt-0.5 text-[12px]">{PLATFORM_LABEL[channel.platform]}</DialogDescription>
            )}
          </div>
          {mode === "connect" && view === "questions" ? (
            <Button variant="ghost" size="sm" onClick={skip} disabled={saving} className="-mr-2 shrink-0 text-muted-foreground hover:text-ink">
              Skip
            </Button>
          ) : (
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" disabled={saving} className="-mr-2 shrink-0 text-muted-foreground hover:text-ink">
                <X />
              </Button>
            </DialogClose>
          )}
        </DialogHeader>

        {view === "next" && goal && goalStyle && GoalIcon ? (
          <>
            <div className="px-5 pt-5 sm:px-6">
              <div className={cn("relative overflow-hidden rounded-2xl px-5 py-6", TONES[goalStyle.tone].soft)}>
                <span aria-hidden className="bg-grid pointer-events-none absolute inset-0 [--grid-size:22px]" />
                <span aria-hidden className={cn("relative flex h-11 w-11 -rotate-6 items-center justify-center rounded-xl", TONES[goalStyle.tone].solid)}>
                  <GoalIcon className="h-5 w-5" strokeWidth={2} />
                </span>
                <p className={cn("brand-label relative mt-5", TONES[goalStyle.tone].text)}>{goal}</p>
                <h3 ref={headingRef} tabIndex={-1} className="relative mt-1.5 font-display text-[26px] leading-[1.05] text-ink outline-none">
                  Start with a template
                </h3>
              </div>
            </div>
            <DialogFooter className="flex-row items-center justify-end gap-2 px-5 pb-5 pt-4 sm:px-6">
              <Button variant="ghost" onClick={onDone}>
                Close
              </Button>
              <Button asChild>
                <Link href={templatesHref} onClick={onDone}>
                  Browse templates
                  <ArrowRight />
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* `clip`, so the sliding question never draws outside the dialog. */}
            <div className="overflow-x-clip px-5 pt-5 sm:px-6">
              <Progress index={index} total={total} />
              <div
                key={index}
                className={cn(
                  "mt-5",
                  direction === "forward" ? "animate-slide-in-right" : "animate-slide-in-left",
                  "motion-reduce:animate-none",
                )}
              >
                <h3 ref={headingRef} id={headingId} tabIndex={-1} className="font-display text-[24px] leading-[1.05] text-balance outline-none">
                  {question.title(name)}
                </h3>
                <p className="brand-label mt-2 text-muted-foreground">{multi ? "Choose all that apply" : "Choose one"}</p>
                {/* As tall as the longest list, so Continue stays under the pointer from one question to the next. */}
                <div role={multi ? "group" : "radiogroup"} aria-labelledby={headingId} className="mt-4 grid content-start gap-2 sm:min-h-[292px]">
                  {question.options.map((option) => {
                    const goalTone = question.id === GOALS.id ? templateGoalFor(option.value) : null;
                    return (
                      <OptionRow
                        key={option.value}
                        option={option}
                        selected={multi ? Array.isArray(value) && value.includes(option.value) : value === option.value}
                        multi={multi}
                        // Goals wear the gallery's colours; the rest the account's platform.
                        tone={goalTone ? GOAL_STYLE[goalTone].tone : platformTone}
                        onToggle={() => setAnswers((prev) => toggleAnswer(question, prev, option.value))}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter className="flex-row items-center justify-between gap-3 px-5 pb-5 pt-4 sm:justify-between sm:px-6">
              {index > 0 ? (
                <Button variant="ghost" onClick={back} disabled={saving} className="-ml-3">
                  <ChevronLeft />
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={() => void next()} disabled={!isAnswered(question, answers)} loading={saving}>
                {isLast ? "Save" : "Continue"}
                {isLast ? null : <ArrowRight />}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
