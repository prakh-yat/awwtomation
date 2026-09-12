import type { AutomationStatus, ChannelStatus, DeliveryStatus, JobStatus, PlanTier } from "@prisma/client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { humanize, PLAN_LABELS } from "./constants";

type Variant = NonNullable<BadgeProps["variant"]>;

const JOB: Record<JobStatus, Variant> = {
  PENDING: "outline",
  PROCESSING: "secondary",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "secondary",
};

const CHANNEL: Record<ChannelStatus, Variant> = {
  ACTIVE: "success",
  TOKEN_EXPIRED: "warning",
  ERROR: "destructive",
  DISCONNECTED: "outline",
};

const AUTOMATION: Record<AutomationStatus, Variant> = { ACTIVE: "success", PAUSED: "warning", DRAFT: "outline" };

function deliveryVariant(status: DeliveryStatus): Variant {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "destructive";
  return "warning";
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={JOB[status]}>{humanize(status)}</Badge>;
}

export function ChannelStatusBadge({ status }: { status: ChannelStatus }) {
  return <Badge variant={CHANNEL[status]}>{humanize(status)}</Badge>;
}

export function AutomationStatusBadge({ status }: { status: AutomationStatus }) {
  return <Badge variant={AUTOMATION[status]}>{humanize(status)}</Badge>;
}

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return <Badge variant={deliveryVariant(status)}>{humanize(status)}</Badge>;
}

export function PlanBadge({ plan }: { plan: PlanTier }) {
  return <Badge variant={plan === "FREE" ? "outline" : "default"}>{PLAN_LABELS[plan]}</Badge>;
}

export type Tone = "success" | "warning" | "destructive" | "muted";

const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/40",
};

/** The only place color enters the admin UI: a 8px status dot. */
export function StatusDot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2 w-2 shrink-0", className)} aria-hidden>
      {pulse ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", DOT[tone])} /> : null}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", DOT[tone])} />
    </span>
  );
}
