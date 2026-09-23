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
import { Expand, LayoutList, Maximize2, Minus, Plus, Redo2, Shrink, Undo2 } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TONE_HEX } from "@/components/ui/tone";
import type { PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import {
  EDGE_DEFAULTS,
  hasCrowdedNodes,
  NODE_WIDTH,
  prefilledNodeData,
  tidyPositions,
  type AddableNodeType,
  type BuilderAction,
  type BuilderEdge,
  type BuilderNode,
} from "./builder-state";
import { edgeTypes } from "./insertable-edge";
import { nodeTypes } from "./nodes";
import { STEP_DRAG_TYPE, STEP_INFO, StepList } from "./step-catalog";
import { StepPalette } from "./step-palette";

export type FlowCanvasProps = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  pipelines: PipelineSummary[];
  platform: ChannelPlatform | null;
  dispatch: React.Dispatch<BuilderAction>;
  canUndo: boolean;
  canRedo: boolean;
  /** True while the side panels are hidden. */
  canvasOnly: boolean;
  onCanvasOnlyChange: (next: boolean) => void;
};

/** Room around the flow: the palette sits top left and the toolbar along the bottom. */
const FIT = { padding: { top: "56px", bottom: "96px", left: "220px", right: "48px" }, maxZoom: 1, duration: 300 } as const;

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
export function FlowCanvas({ nodes, edges, pipelines, platform, dispatch, canUndo, canRedo, canvasOnly, onCanvasOnlyChange }: FlowCanvasProps) {
  const { fitView, screenToFlowPosition, zoomIn, zoomOut, setCenter, getViewport } = useReactFlow();
  const { zoom } = useViewport();
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [dropEdgeId, setDropEdgeId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingConnection | null>(null);

  // A new step that lands off screen is brought into view without refitting
  // the whole flow, so the canvas never jumps under the pointer.
  const nodeCount = nodes.length;
  const previousCount = React.useRef(nodeCount);
  React.useEffect(() => {
    const grew = nodeCount > previousCount.current;
    previousCount.current = nodeCount;
    if (!grew) return;
    const added = nodes.find((n) => n.selected) ?? nodes[nodes.length - 1];
    const box = boxRef.current?.getBoundingClientRect();
    if (!added || !box) return;
    const t = setTimeout(() => {
      const vp = getViewport();
      const w = (added.measured?.width ?? NODE_WIDTH) * vp.zoom;
      const h = (added.measured?.height ?? 140) * vp.zoom;
      const left = added.position.x * vp.zoom + vp.x;
      const top = added.position.y * vp.zoom + vp.y;
      const visible = left >= 16 && top >= 16 && left + w <= box.width - 16 && top + h <= box.height - 80;
      if (!visible) {
        void setCenter(added.position.x + (added.measured?.width ?? NODE_WIDTH) / 2, added.position.y + (added.measured?.height ?? 140) / 2, { zoom: vp.zoom, duration: 350 });
      }
    }, 40);
    return () => clearTimeout(t);
  }, [nodeCount, nodes, getViewport, setCenter]);

  // The canvas is resizable (window, side panels); keep the flow framed when its box changes size.
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
      timer = setTimeout(() => void fitView({ ...FIT, duration: 250 }), 120);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [fitView]);

  // Flows laid out for smaller steps can overlap once measured; tidy them once when the canvas opens.
  const nodesInitialized = useNodesInitialized();
  const tidiedOnOpen = React.useRef(false);
  React.useEffect(() => {
    if (!nodesInitialized || tidiedOnOpen.current) return;
    tidiedOnOpen.current = true;
    if (!hasCrowdedNodes(nodes)) return;
    dispatch({ type: "arrange", positions: tidyPositions(nodes, edges), rebaseline: true });
    setTimeout(() => void fitView({ ...FIT, duration: 0 }), 60);
  }, [nodesInitialized, nodes, edges, dispatch, fitView]);

  function tidyUp() {
    dispatch({ type: "arrange", positions: tidyPositions(nodes, edges) });
    setTimeout(() => void fitView(FIT), 60);
  }

  const addStep = React.useCallback(
    (nodeType: AddableNodeType) => dispatch({ type: "addNode", nodeType, data: prefilledNodeData(nodeType, pipelines) }),
    [dispatch, pipelines],
  );

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
      data: prefilledNodeData(type, pipelines),
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
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgb(15 15 15 / 0.16)" />

        <Panel position="top-left" className="!m-3 flex max-h-[calc(100%-5.5rem)]">
          <StepPalette platform={platform} onAdd={addStep} />
        </Panel>

        {nodeCount > 5 ? (
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
          <div className="flex items-center gap-0.5 rounded-full border bg-background/95 p-1 shadow-elevated backdrop-blur">
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
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <ToolButton label={canvasOnly ? "Show panels" : "Full canvas"} onClick={() => onCanvasOnlyChange(!canvasOnly)} active={canvasOnly}>
              {canvasOnly ? <Shrink /> : <Expand />}
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
                data: prefilledNodeData(nodeType, pipelines),
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
