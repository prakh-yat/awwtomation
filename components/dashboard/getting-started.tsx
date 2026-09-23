import Link from "next/link";
import type { ChannelPlatform } from "@prisma/client";
import { ArrowRight, Check } from "lucide-react";

import { connectHref } from "@/components/channels/channel-status";
import type { MetaConfigured } from "@/components/channels/connect-buttons";
import { stagger } from "@/components/charts/stagger";
import { Button } from "@/components/ui/button";
import { PlatformMark } from "@/components/ui/platform-badge";
import { brand } from "@/lib/brand";
import type { SetupProgress } from "@/lib/services/analytics";
import { cn } from "@/lib/utils";

type Step = {
  key: keyof SetupProgress;
  title: string;
  /** Only where it saves a wasted attempt. */
  hint?: string;
  href: string;
  cta: string;
};

const STEPS: readonly Step[] = [
  {
    key: "hasChannel",
    title: "Connect an account",
    hint: "An Instagram professional account or a Facebook Page.",
    href: "/dashboard?accounts=1",
    cta: "Connect account",
  },
  {
    key: "hasAutomation",
    title: "Create an automation",
    href: "/automations/templates",
    cta: "Create automation",
  },
  {
    key: "hasSentDm",
    title: "Test it with a comment",
    hint: "Comment your keyword from a different account.",
    href: "/logs",
    cta: "Open Logs",
  },
];

const CONNECT: ReadonlyArray<{ platform: ChannelPlatform; label: string }> = [
  { platform: "INSTAGRAM", label: "Instagram" },
  { platform: "FACEBOOK", label: "Facebook Page" },
];

/** The first step's way in: both platforms, straight to Meta's sign-in. */
function ConnectChoices({ configured, primary }: { configured: MetaConfigured; primary: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CONNECT.map(({ platform, label }) => {
        const ready = platform === "INSTAGRAM" ? configured.instagram : configured.facebook;
        return ready ? (
          <Button key={platform} asChild size="sm" variant={primary && platform === "INSTAGRAM" ? "highlight" : "outline"}>
            {/* A plain anchor: the target is a route handler that redirects to Meta. */}
            <a href={connectHref(platform)}>
              <PlatformMark aria-hidden platform={platform} size={16} />
              {label}
            </a>
          </Button>
        ) : (
          <Button key={platform} size="sm" variant="outline" disabled title="Unavailable right now">
            <PlatformMark aria-hidden platform={platform} size={16} />
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * First-run checklist, in the dashboard's yellow. The next incomplete step is
 * the white card with the yellow button, later ones stay quiet, so there is
 * exactly one obvious thing to do.
 */
export function GettingStarted({
  setup,
  configured,
  canConnect,
  compact = false,
  className,
}: {
  setup: SetupProgress;
  configured: MetaConfigured;
  /** Admins connect accounts; everyone else is told who can. */
  canConnect: boolean;
  /** Tighter, for when the checklist shares the screen with the numbers. */
  compact?: boolean;
  className?: string;
}) {
  const doneCount = STEPS.filter((s) => setup[s.key]).length;
  const nextIndex = STEPS.findIndex((s) => !setup[s.key]);

  return (
    <section
      aria-labelledby="getting-started-title"
      className={cn("relative flex shrink-0 flex-col overflow-hidden rounded-3xl bg-yellow text-ink", compact ? "p-5" : "p-5 sm:p-7", className)}
    >
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [--grid-size:36px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <h2 id="getting-started-title" className={cn("font-display leading-none", compact ? "text-[24px]" : "text-[26px] sm:text-[30px]")}>
          Set up {brand.name}
        </h2>
        <div className="w-full sm:w-52">
          <p className="brand-label flex justify-between">
            <span>Progress</span>
            <span className="tabular-nums">
              {doneCount} of {STEPS.length}
            </span>
          </p>
          <div
            className="mt-2 grid grid-cols-3 gap-1"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={STEPS.length}
            aria-valuenow={doneCount}
          >
            {STEPS.map((step, i) => (
              <span key={step.key} className={cn("h-2 rounded-full", i < doneCount ? "bg-ink" : "bg-ink/15")} />
            ))}
          </div>
        </div>
      </div>

      <ol className={cn("relative grid gap-3 md:grid-cols-3", compact ? "mt-4" : "mt-6 lg:flex-1 lg:content-start")}>
        {STEPS.map((step, i) => {
          const done = setup[step.key];
          const isNext = i === nextIndex;
          const connectStep = step.key === "hasChannel";
          return (
            <li
              key={step.key}
              className={cn(
                "rise flex flex-col rounded-2xl",
                compact ? "p-4" : "p-4 sm:p-5",
                isNext ? "bg-paper shadow-[0_14px_30px_-18px_rgb(15_15_15/0.45)]" : "bg-paper/55",
              )}
              style={stagger(i)}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "font-display flex items-center justify-center rounded-full",
                    compact ? "h-8 w-8 text-[14px]" : "h-9 w-9 text-[15px]",
                    done ? "bg-green text-white" : "bg-ink text-yellow",
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                {done ? <span className="brand-label text-green-ink">Done</span> : null}
              </div>
              <h3 className={cn("text-[15px] font-semibold leading-snug", compact ? "mt-3" : "mt-4", done && "text-ink/60")}>
                <span className="sr-only">{done ? "Done: " : `Step ${i + 1}: `}</span>
                {step.title}
              </h3>
              {step.hint && !done && !compact ? <p className="mt-1 text-[13px] text-muted-foreground">{step.hint}</p> : null}
              {done ? null : (
                <div className={cn("mt-auto", compact ? "pt-3" : "pt-5")}>
                  {connectStep ? (
                    canConnect ? (
                      <ConnectChoices configured={configured} primary={isNext} />
                    ) : (
                      <p className="text-[13px] font-medium text-muted-foreground">Ask a workspace admin to connect one.</p>
                    )
                  ) : (
                    <Button asChild size="sm" variant={isNext ? "highlight" : "outline"}>
                      <Link href={step.href}>
                        {step.cta}
                        {isNext ? <ArrowRight /> : null}
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
