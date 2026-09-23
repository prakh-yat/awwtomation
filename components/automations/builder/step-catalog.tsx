"use client";

import * as React from "react";
import type { ChannelPlatform } from "@prisma/client";
import {
  BotMessageSquare,
  CircleArrowRight,
  CircleMinus,
  CirclePlus,
  HelpCircle,
  MessageSquare,
  Tag,
  TagIcon,
  Timer,
  UserCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TONES, type Tone } from "@/components/ui/tone";
import type { FlowNodeType } from "@/lib/automation/flow-types";
import { cn } from "@/lib/utils";

import type { AddableNodeType } from "./builder-state";

export type StepKind = "trigger" | "send" | "logic" | "contact";

export type StepInfo = { label: string; hint: string; icon: LucideIcon; kind: StepKind; tone: Tone };

/** Every step the canvas knows: its name, one-line hint, icon, group and colour. */
export const STEP_INFO: Record<FlowNodeType, StepInfo> = {
  trigger: { label: "Trigger", hint: "Starts the automation", icon: Zap, kind: "trigger", tone: "yellow" },
  send_message: { label: "Send message", hint: "Text, buttons or an image", icon: MessageSquare, kind: "send", tone: "purple" },
  ask_question: { label: "Ask a question", hint: "Saves their answer", icon: HelpCircle, kind: "send", tone: "sky" },
  ai_reply: { label: "AI reply", hint: "Your agent answers", icon: BotMessageSquare, kind: "send", tone: "ink" },
  condition_follow: { label: "Follow gate", hint: "Checks they follow you", icon: UserCheck, kind: "logic", tone: "orange" },
  delay: { label: "Delay", hint: "Waits, then continues", icon: Timer, kind: "logic", tone: "lavender" },
  add_tag: { label: "Add tag", hint: "Tags the contact", icon: Tag, kind: "contact", tone: "green" },
  remove_tag: { label: "Remove tag", hint: "Removes a tag", icon: TagIcon, kind: "contact", tone: "green" },
  add_to_pipeline: { label: "Add to pipeline", hint: "Puts them in a pipeline", icon: CirclePlus, kind: "contact", tone: "blue" },
  move_stage: { label: "Move stage", hint: "Moves them to a stage", icon: CircleArrowRight, kind: "contact", tone: "blue" },
  remove_from_pipeline: { label: "Remove from pipeline", hint: "Takes them out", icon: CircleMinus, kind: "contact", tone: "blue" },
};

export const STEP_GROUPS: ReadonlyArray<{ label: string; types: AddableNodeType[] }> = [
  { label: "Send", types: ["send_message", "ask_question", "ai_reply"] },
  { label: "Wait and branch", types: ["condition_follow", "delay"] },
  { label: "Update the contact", types: ["add_tag", "remove_tag", "add_to_pipeline", "move_stage", "remove_from_pipeline"] },
];

/**
 * Steps that only mean something on one platform. Facebook has no followers in
 * Instagram's sense, so a follow gate on Messenger would always pass.
 */
export function stepAvailable(type: AddableNodeType, platform: ChannelPlatform | null | undefined): boolean {
  if (type === "condition_follow") return platform !== "FACEBOOK";
  return true;
}

/** The drag payload a palette step carries onto the canvas. */
export const STEP_DRAG_TYPE = "application/x-awwtomation-step";

export function StepIcon({ type, size = 28, className }: { type: FlowNodeType; size?: number; className?: string }) {
  const info = STEP_INFO[type];
  const Icon = info.icon;
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center", TONES[info.tone].solid, info.tone === "lavender" || info.tone === "sky" ? "text-ink" : null, className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }}
    >
      <Icon style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }} strokeWidth={2.1} />
    </span>
  );
}

/** The step picker behind every + on the canvas: grouped, coloured, one click to add. */
export function AddStepMenu({
  children,
  onPick,
  align = "start",
  label,
  platform,
}: {
  /** The trigger element (rendered with asChild). */
  children: React.ReactNode;
  onPick: (type: AddableNodeType) => void;
  align?: "start" | "center" | "end";
  label?: string;
  platform?: ChannelPlatform | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        collisionPadding={12}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-y-auto"
      >
        {label ? <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-semibold text-ink">{label}</p> : null}
        {STEP_GROUPS.map((group) => {
          const types = group.types.filter((t) => stepAvailable(t, platform));
          if (types.length === 0) return null;
          return (
            <React.Fragment key={group.label}>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {types.map((type) => (
                <DropdownMenuItem key={type} onSelect={() => onPick(type)} className="gap-2.5 py-1.5">
                  <StepIcon type={type} size={24} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold leading-tight text-ink">{STEP_INFO[type].label}</span>
                    <span className="truncate text-[11px] leading-snug text-muted-foreground">{STEP_INFO[type].hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A plain list of steps for a popover (the picker that opens where a dragged connection is dropped). */
export function StepList({ onPick, platform, title }: { onPick: (type: AddableNodeType) => void; platform?: ChannelPlatform | null; title?: string }) {
  return (
    <div className="w-60">
      {title ? <p className="px-2.5 pb-1 pt-1 text-[12px] font-semibold">{title}</p> : null}
      {STEP_GROUPS.map((group) => {
        const types = group.types.filter((t) => stepAvailable(t, platform));
        if (types.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="brand-label px-2.5 pb-1 pt-2 text-muted-foreground">{group.label}</p>
            {types.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onPick(type)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-fog focus-visible:bg-fog"
              >
                <StepIcon type={type} size={24} />
                <span className="font-semibold">{STEP_INFO[type].label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
