"use client";

import * as React from "react";
import type { ChannelPlatform } from "@prisma/client";
import { GripVertical, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AddableNodeType } from "./builder-state";
import { STEP_DRAG_TYPE, STEP_GROUPS, STEP_INFO, StepIcon, stepAvailable } from "./step-catalog";

/**
 * The steps, ready to drag onto the canvas. Drop one on a connection to put it
 * in between, or anywhere below a step to hang it off that step. A click adds
 * it after the selected step instead.
 */
export function StepPalette({ platform, onAdd }: { platform: ChannelPlatform | null; onAdd: (type: AddableNodeType) => void }) {
  const [collapsed, setCollapsed] = React.useState(false);

  function onDragStart(event: React.DragEvent, type: AddableNodeType) {
    event.dataTransfer.setData(STEP_DRAG_TYPE, type);
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-2xl border bg-background/95 shadow-elevated backdrop-blur">
      <div className={cn("flex items-center gap-2 border-b py-2", collapsed ? "justify-center px-1.5" : "justify-between pl-3 pr-1.5")}>
        {collapsed ? null : <span className="brand-label text-muted-foreground">Steps</span>}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Show step names" : "Hide step names"}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fog hover:text-ink"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="scrollbar-none overflow-y-auto p-1.5">
        {STEP_GROUPS.map((group, g) => {
          const types = group.types.filter((t) => stepAvailable(t, platform));
          if (types.length === 0) return null;
          return (
            <div key={group.label} className={cn(g > 0 && "mt-1 border-t pt-1")}>
              {collapsed ? null : <p className="brand-label px-2 pb-1 pt-1.5 text-muted-foreground">{group.label}</p>}
              {types.map((type) => {
                const item = (
                  <button
                    key={type}
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, type)}
                    onClick={() => onAdd(type)}
                    aria-label={`Add ${STEP_INFO[type].label}`}
                    className={cn(
                      "group flex w-full cursor-grab items-center gap-2.5 rounded-xl text-left outline-none transition-colors hover:bg-fog focus-visible:bg-fog active:cursor-grabbing",
                      collapsed ? "justify-center p-1" : "py-1.5 pl-1.5 pr-2",
                    )}
                  >
                    <StepIcon type={type} size={28} className="transition-transform duration-150 group-hover:scale-105" />
                    {collapsed ? null : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{STEP_INFO[type].label}</span>
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                      </>
                    )}
                  </button>
                );
                return collapsed ? (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    <TooltipContent side="right">{STEP_INFO[type].label}</TooltipContent>
                  </Tooltip>
                ) : (
                  item
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
