"use client";

import * as React from "react";
import {
  CircleArrowRight,
  CircleMinus,
  CirclePlus,
  HelpCircle,
  MessageSquare,
  Sparkles,
  Tag,
  TagIcon,
  Timer,
  UserCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FlowNodeType } from "@/lib/automation/flow-types";
import { cn } from "@/lib/utils";

import type { AddableNodeType } from "./builder-state";

export type StepKind = "trigger" | "send" | "logic" | "contact";

export type StepInfo = { label: string; hint: string; icon: LucideIcon; kind: StepKind };

/** Every step the canvas knows: its name, one-line hint, icon and group. */
export const STEP_INFO: Record<FlowNodeType, StepInfo> = {
  trigger: { label: "Trigger", hint: "Starts the automation", icon: Zap, kind: "trigger" },
  send_message: { label: "Send message", hint: "Text, buttons or an image", icon: MessageSquare, kind: "send" },
  ask_question: { label: "Ask a question", hint: "Saves their answer to the contact", icon: HelpCircle, kind: "send" },
  ai_reply: { label: "AI reply", hint: "Your agent answers in your own words", icon: Sparkles, kind: "send" },
  condition_follow: { label: "Follow gate", hint: "Continues only if they follow you", icon: UserCheck, kind: "logic" },
  delay: { label: "Delay", hint: "Waits before the next step", icon: Timer, kind: "logic" },
  add_tag: { label: "Add tag", hint: "Tags the contact", icon: Tag, kind: "contact" },
  remove_tag: { label: "Remove tag", hint: "Takes a tag off the contact", icon: TagIcon, kind: "contact" },
  add_to_pipeline: { label: "Add to pipeline", hint: "Puts the contact in a pipeline", icon: CirclePlus, kind: "contact" },
  move_stage: { label: "Move stage", hint: "Moves the contact to a stage", icon: CircleArrowRight, kind: "contact" },
  remove_from_pipeline: { label: "Remove from pipeline", hint: "Takes the contact out of a pipeline", icon: CircleMinus, kind: "contact" },
};

const COLUMNS: Array<Array<{ label: string; types: AddableNodeType[] }>> = [
  [
    { label: "Send", types: ["send_message", "ask_question", "ai_reply"] },
    { label: "Wait and branch", types: ["condition_follow", "delay"] },
  ],
  [{ label: "Update the contact", types: ["add_tag", "remove_tag", "add_to_pipeline", "move_stage", "remove_from_pipeline"] }],
];

/** The step picker behind "Add step" and the + under each step: two columns so it fits above or below a step. */
export function AddStepMenu({
  children,
  onPick,
  align = "start",
  label,
}: {
  /** The trigger element (rendered with asChild). */
  children: React.ReactNode;
  onPick: (type: AddableNodeType) => void;
  align?: "start" | "center" | "end";
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        collisionPadding={12}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto p-1.5"
      >
        {label ? <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-xs font-normal text-muted-foreground">{label}</DropdownMenuLabel> : null}
        <div className="grid gap-x-1.5 sm:grid-cols-2">
          {COLUMNS.map((groups, column) => (
            <div key={column} className={cn(column > 0 && "sm:border-l sm:pl-1.5")}>
              {groups.map((group, i) => (
                <React.Fragment key={group.label}>
                  {i > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[11px] font-normal text-muted-foreground">{group.label}</DropdownMenuLabel>
                  {group.types.map((type) => {
                    const info = STEP_INFO[type];
                    const Icon = info.icon;
                    return (
                      <DropdownMenuItem key={type} onSelect={() => onPick(type)} className="items-start gap-2.5 py-1.5">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background [&_svg]:!size-3.5 [&_svg]:!text-foreground">
                          <Icon />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium leading-tight">{info.label}</span>
                          <span className="text-[11px] leading-snug text-muted-foreground">{info.hint}</span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
