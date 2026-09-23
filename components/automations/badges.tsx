import type { AutomationStatus, TriggerType } from "@prisma/client";
import { MessageCircle, MessageSquare, Sparkles, type LucideIcon } from "lucide-react";

import { Badge, type BadgeProps, type BadgeVariant } from "@/components/ui/badge";

const STATUS: Record<AutomationStatus, { label: string; variant: BadgeVariant; dot?: BadgeProps["dot"] }> = {
  ACTIVE: { label: "Active", variant: "success", dot: "pulse" },
  PAUSED: { label: "Paused", variant: "yellow", dot: true },
  DRAFT: { label: "Draft", variant: "secondary" },
};

export function AutomationStatusBadge({ status, className }: { status: AutomationStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge variant={s.variant} dot={s.dot} className={className}>
      {s.label}
    </Badge>
  );
}

/** What starts an automation, and the colour that tells the three apart in a list. */
export const TRIGGER_STYLE: Record<TriggerType, { label: string; icon: LucideIcon; tone: "purple" | "sky" | "orange" }> = {
  COMMENT: { label: "Comment", icon: MessageSquare, tone: "purple" },
  DM: { label: "DM", icon: MessageCircle, tone: "sky" },
  STORY_REPLY: { label: "Story reply", icon: Sparkles, tone: "orange" },
};

export function triggerTypeLabel(trigger: TriggerType): string {
  return TRIGGER_STYLE[trigger].label;
}

export function TriggerBadge({ trigger, label, className }: { trigger: TriggerType; label?: string; className?: string }) {
  const t = TRIGGER_STYLE[trigger];
  const Icon = t.icon;
  return (
    <Badge variant={t.tone} className={className}>
      <Icon strokeWidth={2.25} aria-hidden />
      {label ?? t.label}
    </Badge>
  );
}
