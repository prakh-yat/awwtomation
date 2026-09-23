import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const ONBOARDING_STEPS = [
  { n: 1, label: "Organization" },
  { n: 2, label: "Workspace" },
] as const;

/** Two pills joined by a hairline: the current step in ink, a finished one ticked in green. */
export function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Setup progress">
      {ONBOARDING_STEPS.map((step, i) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <li key={step.n} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-3 text-[12px] font-semibold",
                active ? "bg-ink text-white" : done ? "bg-green-soft text-green-ink" : "bg-fog text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] tabular-nums",
                  active ? "bg-white text-ink" : done ? "bg-green text-white" : "bg-background",
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : step.n}
              </span>
              {step.label}
            </span>
            {i < ONBOARDING_STEPS.length - 1 ? <span aria-hidden className="h-px w-5 bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
