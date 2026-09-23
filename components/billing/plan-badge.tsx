import type { PlanTier } from "@prisma/client";
import { Check } from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { TONES, type Tone } from "@/components/ui/tone";
import { PLANS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/**
 * Each plan's colour, used wherever a plan is named. Yellow is left out on
 * purpose: in the plan grid it marks the recommended plan, whichever that is.
 */
export const PLAN_TONE: Record<PlanTier, { tone: Tone; badge: BadgeVariant }> = {
  FREE: { tone: "fog", badge: "outline" },
  STARTER: { tone: "sky", badge: "sky" },
  PRO: { tone: "purple", badge: "purple" },
  AGENCY: { tone: "indigo", badge: "indigo" },
};

/** A small square in the plan's colour, set beside its name. */
export function PlanSwatch({ plan, className }: { plan: PlanTier; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-3 w-3 shrink-0 rounded-[4px]", TONES[PLAN_TONE[plan].tone].dot, className)} />;
}

export function PlanBadge({ plan, className }: { plan: PlanTier; className?: string }) {
  return (
    <Badge variant={PLAN_TONE[plan].badge} className={className}>
      {PLANS[plan].label}
    </Badge>
  );
}

/** The green ticked box in front of each thing a plan includes, as on the pricing page. */
export function FeatureCheck({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-green text-green", className)}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
    </span>
  );
}
