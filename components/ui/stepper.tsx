"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { TONES, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export type StepperStep = { id: string; label: string };

export interface StepperProps {
  steps: readonly StepperStep[];
  /** Index of the step on screen. */
  current: number;
  /** Steps up to here can be revisited by clicking them. */
  reachable: number;
  onStep: (index: number) => void;
  /** Colour of finished steps; usually the section's. */
  tone?: Tone;
  className?: string;
}

/**
 * Numbered steps across the top of a multi-step flow. Finished steps take the
 * section colour and can be clicked to go back; the current one is ink.
 * Below sm it folds into "Step 2 of 4" and a bar.
 */
export function Stepper({ steps, current, reachable, onStep, tone = "orange", className }: StepperProps) {
  const t = TONES[tone];
  return (
    <nav aria-label="Progress" className={className}>
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold">{steps[current]?.label}</span>
          <span className="text-muted-foreground">
            Step {current + 1} of {steps.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fog">
          <div className={cn("h-full rounded-full transition-[width] duration-500 ease-soft", t.dot)} style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <ol className="hidden items-center sm:flex">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = i <= reachable && i !== current;
          return (
            <li key={step.id} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => clickable && onStep(i)}
                disabled={!clickable}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  clickable ? "cursor-pointer hover:bg-fog" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-colors duration-300",
                    active ? "bg-ink text-white" : done ? t.solid : "bg-fog text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4 animate-pop" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-[14px] font-semibold", active ? "text-ink" : done ? "text-ink" : "text-muted-foreground")}>{step.label}</span>
              </button>
              {i < steps.length - 1 ? (
                <span aria-hidden className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-fog">
                  <span className={cn("block h-full origin-left transition-transform duration-500 ease-soft", t.dot, done ? "scale-x-100" : "scale-x-0")} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
