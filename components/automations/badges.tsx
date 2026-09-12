import type { AutomationStatus, TriggerType } from "@prisma/client";
import { MessageCircle, MessageSquare, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS: Record<AutomationStatus, { label: string; variant: "success" | "warning" | "secondary" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  PAUSED: { label: "Paused", variant: "warning" },
  DRAFT: { label: "Draft", variant: "secondary" },
};

export function AutomationStatusBadge({ status, className }: { status: AutomationStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge variant={s.variant} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "DRAFT" && "opacity-40")} aria-hidden />
      {s.label}
    </Badge>
  );
}

const TRIGGER: Record<TriggerType, { label: string; icon: typeof MessageSquare }> = {
  COMMENT: { label: "Comment", icon: MessageSquare },
  DM: { label: "DM", icon: MessageCircle },
  STORY_REPLY: { label: "Story reply", icon: Sparkles },
};

export function triggerTypeLabel(trigger: TriggerType): string {
  return TRIGGER[trigger].label;
}

export function TriggerBadge({ trigger, className }: { trigger: TriggerType; className?: string }) {
  const t = TRIGGER[trigger];
  const Icon = t.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal text-muted-foreground", className)}>
      <Icon className="h-3 w-3" strokeWidth={1.75} />
      {t.label}
    </Badge>
  );
}
