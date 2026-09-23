"use client";

import * as React from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";

import { normalizeHandle } from "@/lib/automation/flow-types";
import { cn } from "@/lib/utils";

import { BuilderNodeContext } from "./nodes";
import { AddStepMenu } from "./step-catalog";

/**
 * A connection with a + in the middle: hover it (or select it) to put a step in
 * between, or to remove it. The same insert happens when a step from the
 * palette is dropped on it, which the canvas highlights with `data.dropTarget`.
 */
export function InsertableEdge({ id, source, sourceHandleId, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, data }: EdgeProps) {
  const { onAddAfter, platform } = React.useContext(BuilderNodeContext);
  const { deleteElements } = useReactFlow();
  const [hover, setHover] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 18, offset: 24 });
  const dropTarget = Boolean(data?.dropTarget);
  const showControls = hover || selected || menuOpen;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={cn(dropTarget && "!stroke-purple !stroke-[3px]")} interactionWidth={28} />
      {/* A wider invisible track so the controls appear before the pointer is exactly on the line. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={36} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="react-flow__edge-interaction" />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "nodrag nopan pointer-events-auto absolute flex items-center gap-1 transition-[opacity,transform] duration-150",
            showControls || dropTarget ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0",
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {dropTarget ? (
            <span className="rounded-full bg-purple px-2.5 py-1 text-[11px] font-semibold text-white shadow-pop">Drop to insert</span>
          ) : (
            <>
              <AddStepMenu
                onPick={(type) => onAddAfter(source, normalizeHandle(sourceHandleId), type)}
                align="center"
                label="Insert a step here"
                platform={platform}
              >
                <button
                  type="button"
                  aria-label="Insert a step here"
                  onClick={() => setMenuOpen(true)}
                  onBlur={() => setMenuOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-purple text-white shadow-pop outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </AddStepMenu>
              <button
                type="button"
                aria-label="Remove this connection"
                onClick={() => void deleteElements({ edges: [{ id }] })}
                className="flex h-6 w-6 items-center justify-center rounded-full border bg-white text-muted-foreground shadow-pop outline-none transition-colors hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { insertable: InsertableEdge };
