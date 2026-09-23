"use client";

import * as React from "react";
import { ArrowRight, ChevronRight, LoaderCircle, Magnet, MessagesSquare, MousePointerClick, ShoppingBag, UserPlus, type LucideIcon } from "lucide-react";

import { StepIcon } from "@/components/automations/builder/step-catalog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TONES, type Tone } from "@/components/ui/tone";
import type { TemplateGoal, TemplateStep, TemplateSummary } from "@/lib/services/templates";
import { cn } from "@/lib/utils";

/**
 * A colour and an icon per goal, so the grid reads by what a template is for
 * before any name is read. Written in the order the goal filters are listed.
 */
export const GOAL_STYLE: Record<TemplateGoal, { tone: Tone; icon: LucideIcon }> = {
  "Grow your followers": { tone: "orange", icon: UserPlus },
  "Engage your audience": { tone: "sky", icon: MessagesSquare },
  "Drive traffic": { tone: "indigo", icon: MousePointerClick },
  "Capture leads": { tone: "green", icon: Magnet },
  "Sell more": { tone: "yellow", icon: ShoppingBag },
};

export const GOAL_ORDER = Object.keys(GOAL_STYLE) as TemplateGoal[];

/** The template's main path as chips in the builder's step colours. Spans only: it sits inside the card's button. */
export function StepChips({ steps, id, className }: { steps: TemplateStep[]; id?: string; className?: string }) {
  return (
    <span id={id} className={cn("flex flex-wrap items-center gap-x-0.5 gap-y-1.5", className)}>
      {steps.map((step, i) => (
        <span key={i} className="flex min-w-0 items-center gap-0.5">
          <span className="inline-flex min-w-0 max-w-[11rem] items-center gap-1.5 rounded-[8px] bg-fog py-0.5 pl-0.5 pr-2 text-[11px] font-semibold leading-5 text-ink">
            <StepIcon type={step.type} size={20} />
            <span className="truncate">{step.label}</span>
          </span>
          {i < steps.length - 1 ? <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden /> : null}
        </span>
      ))}
    </span>
  );
}

export function TemplateCard({
  template,
  pending,
  disabled,
  onChoose,
}: {
  template: TemplateSummary;
  /** This card's template is being created. */
  pending: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const id = React.useId();
  const goal = GOAL_STYLE[template.goal];
  const GoalIcon = goal.icon;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChoose}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-description ${id}-steps`}
      aria-busy={pending || undefined}
      className={cn(
        "lift group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left",
        "hover:border-ink/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        disabled && !pending && "opacity-50",
      )}
    >
      <span className={cn("relative flex h-[76px] w-full shrink-0 items-center gap-3 px-4", TONES[goal.tone].soft)}>
        <span aria-hidden className="bg-grid pointer-events-none absolute inset-0 [--grid-size:22px]" />
        <span
          aria-hidden
          className={cn(
            "relative flex h-10 w-10 shrink-0 -rotate-6 items-center justify-center rounded-xl shadow-[0_10px_20px_-12px_rgb(15_15_15/0.55)] transition-transform duration-300 ease-soft motion-safe:group-hover:rotate-0",
            TONES[goal.tone].solid,
          )}
        >
          <GoalIcon className="h-5 w-5" strokeWidth={2} />
        </span>
        {/* `relative` keeps these above the grid overlay, which is positioned. */}
        <span className={cn("brand-label relative min-w-0 truncate", TONES[goal.tone].text)}>{template.goal}</span>
        {template.popular ? <Badge className="relative ml-auto shrink-0">Popular</Badge> : null}
      </span>

      <span className="flex w-full flex-1 flex-col p-4">
        <span id={`${id}-name`} className="text-[15px] font-semibold leading-snug text-ink">
          {template.name}
        </span>
        {/* One line is enough to tell two templates apart; the full text is on hover. */}
        <span id={`${id}-description`} title={template.description} className="mt-1 truncate text-[13px] text-muted-foreground">
          {template.description}
        </span>
        <StepChips id={`${id}-steps`} steps={template.steps} className="mt-4" />
        <span className="mt-auto flex justify-end pt-4">
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "group-hover:border-ink group-hover:bg-ink group-hover:text-white")}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {pending ? "Creating" : "Use template"}
            {pending ? null : <ArrowRight className="transition-transform duration-200 ease-soft motion-safe:group-hover:translate-x-0.5" aria-hidden />}
          </span>
        </span>
      </span>
    </button>
  );
}

export type TemplateSection = { title?: string; templates: TemplateSummary[] };

/** Template cards in titled sections; cards rise in turn, counted across sections. */
export function TemplateGallery({
  sections,
  pendingId,
  onChoose,
}: {
  sections: TemplateSection[];
  /** The template being created, which disables the rest. */
  pendingId: string | null;
  onChoose: (templateId: string) => void;
}) {
  let index = 0;
  return (
    <div className="space-y-8">
      {sections.map((section, s) =>
        section.templates.length === 0 ? null : (
          <section key={section.title ?? s}>
            {section.title ? <h3 className="brand-label mb-3 text-muted-foreground">{section.title}</h3> : null}
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {section.templates.map((template) => {
                const i = index++;
                return (
                  <li key={template.id} className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                    <TemplateCard
                      template={template}
                      pending={pendingId === template.id}
                      disabled={pendingId !== null}
                      onChoose={() => onChoose(template.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
