import Link from "next/link";
import { ArrowRight, Check, MessageSquare, Plug, Workflow, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/lib/brand";
import type { SetupProgress } from "@/lib/services/analytics";
import { cn } from "@/lib/utils";

type Step = {
  key: keyof SetupProgress;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: LucideIcon;
};

const STEPS: readonly Step[] = [
  {
    key: "hasChannel",
    title: "Connect a channel",
    description: "Link an Instagram professional account or a Facebook Page.",
    href: "/channels",
    cta: "Connect",
    icon: Plug,
  },
  {
    key: "hasAutomation",
    title: "Create an automation",
    description: "Pick a post, choose a keyword and write the DM people receive.",
    href: "/automations/new",
    cta: "Create",
    icon: Workflow,
  },
  {
    key: "hasSentDm",
    title: "Watch DMs arrive",
    description: "Comment your keyword on the post — the first delivery shows up in your logs.",
    href: "/logs",
    cta: "Open logs",
    icon: MessageSquare,
  },
];

/**
 * First-run checklist. Steps unlock in order: the next incomplete step gets
 * the black button, later ones stay quiet so there is exactly one obvious
 * thing to do.
 */
export function GettingStarted({ setup }: { setup: SetupProgress }) {
  const doneCount = STEPS.filter((s) => setup[s.key]).length;
  const nextIndex = STEPS.findIndex((s) => !setup[s.key]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Get started with {brand.name}</CardTitle>
          <CardDescription>Three steps to your first automated DM.</CardDescription>
        </div>
        <div className="w-32 text-right">
          <p className="text-xs tabular-nums text-muted-foreground">
            {doneCount} of {STEPS.length} done
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={doneCount}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ol className="divide-y">
          {STEPS.map((step, i) => {
            const done = setup[step.key];
            const isNext = i === nextIndex;
            const Icon = step.icon;
            return (
              <li key={step.key} className={cn("flex items-center gap-4 px-5 py-4", !done && !isNext && "opacity-60")}>
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                    done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Icon className="h-4 w-4" strokeWidth={1.75} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                    <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{step.description}</p>
                </div>
                {done ? (
                  <span className="text-xs font-medium text-success">Done</span>
                ) : (
                  <Button asChild size="sm" variant={isNext ? "default" : "outline"}>
                    <Link href={step.href}>
                      {step.cta}
                      {isNext ? <ArrowRight /> : null}
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
