import { cn } from "@/lib/utils";

export const ONBOARDING_STEPS = [
  { n: 1, label: "Create organization" },
  { n: 2, label: "Connect Instagram" },
] as const;

/** "1 Create organization · 2 Connect Instagram" with the current step in black. */
export function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <ol className="flex items-center justify-center gap-3 text-xs" aria-label="Onboarding progress">
      {ONBOARDING_STEPS.map((step, i) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <li key={step.n} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums",
                  active || done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  step.n
                )}
              </span>
              <span className={cn("font-medium", active ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
            </div>
            {i < ONBOARDING_STEPS.length - 1 ? <span className="text-muted-foreground/60">·</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
