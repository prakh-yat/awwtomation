"use client";

import "@xyflow/react/dist/style.css";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MiniMap,
  Panel,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  useViewport,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import type { ChannelPlatform } from "@prisma/client";
import { LayoutList, Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TONE_HEX } from "@/components/ui/tone";
import type { FlowNodeData } from "@/lib/automation/flow-types";
import { cn } from "@/lib/utils";

import { EDGE_DEFAULTS, hasCrowdedNodes, NODE_WIDTH, tidyPositions, type AddableNodeType, type BuilderAction, type BuilderEdge, type BuilderNode } from "./builder-state";
import { edgeTypes } from "./insertable-edge";
import { nodeTypes } from "./nodes";
import { STEP_DRAG_TYPE, STEP_INFO, StepList } from "./step-catalog";
import { StepPalette } from "./step-palette";

/** Which side a settings panel floats on: the trigger's on the left, a step's on the right. */
export type PanelSide = "left" | "right";
export const PANEL_WIDTH: Record<PanelSide, number> = { left: 324, right: 360 };
/** A panel's width plus the gap either side of it: how much canvas it covers. */
const PANEL_COVER: Record<PanelSide, number> = { left: PANEL_WIDTH.left + 24, right: PANEL_WIDTH.right + 24 };
/** Room the step palette takes at the left: its full width, or its icons while the trigger panel is open. */
const PALETTE_ROOM = 220;
const COMPACT_PALETTE_ROOM = 72;

export type FlowCanvasProps = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  /** A new step's data, with the obvious choices already made. */
  prefill: (type: AddableNodeType) => FlowNodeData;
  platform: ChannelPlatform | null;
  dispatch: React.Dispatch<BuilderAction>;
  canUndo: boolean;
  canRedo: boolean;
  selectedNodeId: string | null;
  /** The settings panel floating over the canvas, if one is open. */
  panel: PanelSide | null;
};

const px = (n: number) => `${n}px` as const;

/** Room around the flow: the palette sits top left, the toolbar along the bottom, and an open panel on its side. */
function fitOptions(panel: PanelSide | null, duration = 300) {
  return {
    padding: {
      top: px(56),
      bottom: px(96),
      left: px(panel === "left" ? PANEL_COVER.left + COMPACT_PALETTE_ROOM : PALETTE_ROOM),
      right: px(panel === "right" ? PANEL_COVER.right + 48 : 48),
    },
    maxZoom: 1,
    duration,
  };
}

/** The connection under a point, if any: where a dragged step would be inserted. */
function edgeAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const edge = el.closest(".react-flow__edge");
    if (edge) return edge.getAttribute("data-id");
  }
  return null;
}

function ToolButton({ label, shortcut, onClick, disabled, active, children }: { label: string; shortcut?: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4",
            active && "bg-ink text-white hover:bg-ink/85",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-1.5">
        {label}
        {shortcut ? <Kbd className="border-white/20 bg-white/10 text-white">{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

type PendingConnection = { x: number; y: number; flow: { x: number; y: number }; nodeId: string; handle: string };

/**
 * React Flow surface. Everything mutable goes through `dispatch`; the canvas
 * itself only holds the viewport and what is being dragged over it.
 */
export function FlowCanvas({ nodes, edges, prefill, platform, dispatch, canUndo, canRedo, selectedNodeId, panel }: FlowCanvasProps) {
  const { fitView, screenToFlowPosition, zoomIn, zoomOut, getViewport, setViewport, getNode } = useReactFlow<BuilderNode, BuilderEdge>();
  const { zoom } = useViewport();
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [dropEdgeId, setDropEdgeId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingConnection | null>(null);
  const FIT = React.useMemo(() => fitOptions(panel), [panel]);
  const nodeCount = nodes.length;

  // The selected step (a new one included) is moved into the part of the canvas
  // its panel leaves free, without refitting the whole flow, so the canvas never
  // jumps under the pointer and a panel never hides the step it edits.
  React.useEffect(() => {
    if (!selectedNodeId) return;
    const t = setTimeout(() => {
      const node = getNode(selectedNodeId);
      const box = boxRef.current?.getBoundingClientRect();
      if (!node || !box) return;
      const vp = getViewport();
      const w = (node.measured?.width ?? NODE_WIDTH) * vp.zoom;
      const h = (node.measured?.height ?? 140) * vp.zoom;
      const left = node.position.x * vp.zoom + vp.x;
      const top = node.position.y * vp.zoom + vp.y;
      const minX = (panel === "left" ? PANEL_COVER.left + COMPACT_PALETTE_ROOM : 0) + 16;
      const maxX = box.width - (panel === "right" ? PANEL_COVER.right : 0) - 16;
      const minY = 16;
      const maxY = box.height - 80;
      const fitsX = left >= minX && left + w <= maxX;
      const fitsY = top >= minY && top + h <= maxY;
      if (fitsX && fitsY) return;
      const dx = fitsX ? 0 : (minX + maxX) / 2 - (left + w / 2);
      // Centred, unless the step is taller than the room: then its top edge stays in view.
      const dy = fitsY ? 0 : Math.max((minY + maxY) / 2 - h / 2, minY + 24) - top;
      void setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 350 });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedNodeId, panel, getNode, getViewport, setViewport]);

  // The window can be resized; keep the flow framed when the canvas changes size.
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => void fitView(fitOptions(null, 250)), 120);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [fitView]);

  // Once every step has its size: tidy flows laid out for smaller steps, which can
  // overlap once measured, and frame the whole flow. React Flow's own first fit
  // can run when only some steps are measured and frame just those.
  const nodesInitialized = useNodesInitialized();
  const framedOnOpen = React.useRef(false);
  React.useEffect(() => {
    if (!nodesInitialized || framedOnOpen.current) return;
    framedOnOpen.current = true;
    if (hasCrowdedNodes(nodes)) dispatch({ type: "arrange", positions: tidyPositions(nodes, edges), rebaseline: true });
    setTimeout(() => void fitView(fitOptions(panel, 0)), 60);
  }, [nodesInitialized, nodes, edges, dispatch, fitView, panel]);

  function tidyUp() {
    dispatch({ type: "arrange", positions: tidyPositions(nodes, edges) });
    setTimeout(() => void fitView(FIT), 60);
  }

  const addStep = React.useCallback((nodeType: AddableNodeType) => dispatch({ type: "addNode", nodeType, data: prefill(nodeType) }), [dispatch, prefill]);

  const onNodesChange = React.useCallback((changes: NodeChange<BuilderNode>[]) => dispatch({ type: "nodesChange", changes }), [dispatch]);
  const onEdgesChange = React.useCallback((changes: EdgeChange<BuilderEdge>[]) => dispatch({ type: "edgesChange", changes }), [dispatch]);
  const onConnect = React.useCallback((connection: Connection) => dispatch({ type: "connect", connection }), [dispatch]);

  // Letting go of a connection over empty canvas offers the steps to add right there.
  const onConnectEnd = React.useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || !state.fromHandle || state.fromHandle.type !== "source") return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      setPending({
        x: point.clientX,
        y: point.clientY,
        flow: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        nodeId: state.fromNode.id,
        handle: state.fromHandle.id ?? "next",
      });
    },
    [screenToFlowPosition],
  );

  function onDragOver(event: React.DragEvent) {
    if (!event.dataTransfer.types.includes(STEP_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const id = edgeAt(event.clientX, event.clientY);
    setDropEdgeId((current) => (current === id ? current : id));
  }

  function onDrop(event: React.DragEvent) {
    const type = event.dataTransfer.getData(STEP_DRAG_TYPE) as AddableNodeType;
    setDropEdgeId(null);
    if (!type || !(type in STEP_INFO)) return;
    event.preventDefault();
    dispatch({
      type: "dropNode",
      nodeType: type,
      data: prefill(type),
      position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      edgeId: edgeAt(event.clientX, event.clientY),
    });
  }

  const shownEdges = React.useMemo(
    () => (dropEdgeId ? edges.map((e) => (e.id === dropEdgeId ? { ...e, data: { ...e.data, dropTarget: true } } : e)) : edges),
    [edges, dropEdgeId],
  );

  return (
    <div
      ref={boxRef}
      className="flow-canvas relative h-full w-full bg-[#fafafa]"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropEdgeId(null);
      }}
      onDrop={onDrop}
    >
      <ReactFlow<BuilderNode, BuilderEdge>
        nodes={nodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onPaneClick={() => {
          dispatch({ type: "select", id: null });
          setPending(null);
        }}
        isValidConnection={(c) => c.source !== c.target}
        defaultEdgeOptions={EDGE_DEFAULTS}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionRadius={32}
        fitView
        fitViewOptions={{ padding: FIT.padding, maxZoom: FIT.maxZoom }}
        minZoom={0.25}
        maxZoom={1.5}
        snapToGrid
        snapGrid={[8, 8]}
        nodeDragThreshold={3}
        // Moving a step around is not choosing it: its panel opens on a click, not on a drag.
        selectNodesOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgb(15 15 15 / 0.16)" />

        {/* Moves aside for the trigger's panel instead of hiding under it. */}
        <Panel
          position="top-left"
          className="!my-3 !mr-3 flex max-h-[calc(100%-5.5rem)] transition-[margin] duration-300 ease-soft motion-reduce:transition-none"
          style={{ marginLeft: panel === "left" ? PANEL_COVER.left + 12 : 12 }}
        >
          <StepPalette platform={platform} onAdd={addStep} compact={panel === "left"} />
        </Panel>

        {nodeCount > 5 && panel !== "right" ? (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeBorderRadius={10}
            nodeColor={(n) => TONE_HEX[STEP_INFO[(n as BuilderNode).data.type].tone]}
            nodeStrokeColor="rgba(15,15,15,0.25)"
            maskColor="rgb(250 250 250 / 0.72)"
            style={{ width: 168, height: 112 }}
            className="!mb-3 !mr-3 hidden xl:block"
          />
        ) : null}

        <Panel position="bottom-center" className="!mb-4">
          {/* Centred in the canvas an open panel leaves free. */}
          <div
            className="flex items-center gap-0.5 rounded-full border bg-background/95 p-1 shadow-elevated backdrop-blur transition-transform duration-300 ease-soft motion-reduce:transition-none"
            style={{ transform: `translateX(${panel ? (panel === "left" ? PANEL_COVER.left : -PANEL_COVER.right) / 2 : 0}px)` }}
          >
            <ToolButton label="Zoom out" onClick={() => void zoomOut({ duration: 200 })}>
              <Minus />
            </ToolButton>
            <button
              type="button"
              onClick={() => void fitView(FIT)}
              className="h-8 min-w-[3.25rem] rounded-full px-2 text-[12px] font-semibold tabular-nums text-ink outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fit the flow to the screen"
            >
              {Math.round(zoom * 100)}%
            </button>
            <ToolButton label="Zoom in" onClick={() => void zoomIn({ duration: 200 })}>
              <Plus />
            </ToolButton>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <ToolButton label="Fit to screen" onClick={() => void fitView(FIT)}>
              <Maximize2 />
            </ToolButton>
            <ToolButton label="Tidy up" onClick={tidyUp}>
              <LayoutList />
            </ToolButton>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <ToolButton label="Undo" shortcut="⌘Z" onClick={() => dispatch({ type: "undo" })} disabled={!canUndo}>
              <Undo2 />
            </ToolButton>
            <ToolButton label="Redo" shortcut="⇧⌘Z" onClick={() => dispatch({ type: "redo" })} disabled={!canRedo}>
              <Redo2 />
            </ToolButton>
          </div>
        </Panel>
      </ReactFlow>

      <Popover open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <PopoverAnchor asChild>
          <span aria-hidden className="pointer-events-none fixed h-px w-px" style={{ left: pending?.x ?? 0, top: pending?.y ?? 0 }} />
        </PopoverAnchor>
        <PopoverContent side="bottom" align="start" className="w-auto p-1.5">
          <StepList
            title="Add a step here"
            platform={platform}
            onPick={(nodeType) => {
              if (!pending) return;
              dispatch({
                type: "addNode",
                nodeType,
                data: prefill(nodeType),
                after: { nodeId: pending.nodeId, handle: pending.handle },
                position: { x: Math.round(pending.flow.x - NODE_WIDTH / 2), y: Math.round(pending.flow.y) },
              });
              setPending(null);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
