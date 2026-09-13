"use client";

import "@xyflow/react/dist/style.css";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { Expand, LayoutList, Maximize2, Plus, Shrink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { PipelineSummary } from "@/lib/services/pipelines";

import { EDGE_DEFAULTS, hasCrowdedNodes, prefilledNodeData, tidyPositions, type BuilderAction, type BuilderEdge, type BuilderNode } from "./builder-state";
import { nodeTypes } from "./nodes";
import { AddStepMenu } from "./step-catalog";

export type FlowCanvasProps = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  pipelines: PipelineSummary[];
  dispatch: React.Dispatch<BuilderAction>;
  /** True while the side panels are hidden. */
  canvasOnly: boolean;
  onCanvasOnlyChange: (next: boolean) => void;
};

/** Room around the flow: the toolbar sits top left and the + under the last steps needs space below. */
const FIT = { padding: { top: "72px", bottom: "88px", x: "48px" }, maxZoom: 1, duration: 200 } as const;

/**
 * React Flow surface. Everything mutable goes through `dispatch`; the canvas
 * itself is stateless apart from the viewport, which React Flow owns.
 */
export function FlowCanvas({ nodes, edges, pipelines, dispatch, canvasOnly, onCanvasOnlyChange }: FlowCanvasProps) {
  const { fitView } = useReactFlow();
  const nodeCount = nodes.length;
  const hasSelection = nodes.some((n) => n.selected);

  React.useEffect(() => {
    // Re-frame when the graph grows so a freshly added step is never off-screen.
    const t = setTimeout(() => fitView(FIT), 30);
    return () => clearTimeout(t);
  }, [nodeCount, fitView]);

  // The canvas is resizable (window, sidebar); keep the flow framed when its box changes.
  const boxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => fitView({ ...FIT, duration: 0 }), 120);
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
    setTimeout(() => fitView({ ...FIT, duration: 0 }), 60);
  }, [nodesInitialized, nodes, edges, dispatch, fitView]);

  function tidyUp() {
    dispatch({ type: "arrange", positions: tidyPositions(nodes, edges) });
    setTimeout(() => fitView(FIT), 60);
  }

  const onNodesChange = React.useCallback((changes: NodeChange<BuilderNode>[]) => dispatch({ type: "nodesChange", changes }), [dispatch]);
  const onEdgesChange = React.useCallback((changes: EdgeChange<BuilderEdge>[]) => dispatch({ type: "edgesChange", changes }), [dispatch]);
  const onConnect = React.useCallback((connection: Connection) => dispatch({ type: "connect", connection }), [dispatch]);

  return (
    <div
      ref={boxRef}
      className={[
        "h-full w-full bg-[#f7f7f8]",
        // Monochrome overrides for React Flow's default chrome.
        "[&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-lg [&_.react-flow__controls]:border [&_.react-flow__controls]:shadow-card",
        "[&_.react-flow__controls-button]:h-7 [&_.react-flow__controls-button]:w-7 [&_.react-flow__controls-button]:border-b [&_.react-flow__controls-button]:border-border [&_.react-flow__controls-button]:bg-white [&_.react-flow__controls-button:hover]:bg-secondary",
        "[&_.react-flow__controls-button_svg]:fill-foreground",
        "[&_.react-flow__minimap]:overflow-hidden [&_.react-flow__minimap]:rounded-lg [&_.react-flow__minimap]:border [&_.react-flow__minimap]:shadow-card",
        "[&_.react-flow__edge.selected_.react-flow__edge-path]:!stroke-[2.5px]",
        "[&_.react-flow__edge:hover_.react-flow__edge-path]:!stroke-[2.25px]",
        "[&_.react-flow__connectionline]:stroke-foreground",
      ].join(" ")}
    >
      <ReactFlow<BuilderNode, BuilderEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => dispatch({ type: "select", id: null })}
        defaultEdgeOptions={EDGE_DEFAULTS}
        connectionLineStyle={{ stroke: "#0a0a0a", strokeWidth: 1.5 }}
        fitView
        fitViewOptions={{ padding: FIT.padding, maxZoom: FIT.maxZoom }}
        minZoom={0.25}
        maxZoom={1.5}
        snapToGrid
        snapGrid={[8, 8]}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#d0d0d6" />
        <Controls showInteractive={false} showFitView={false} position="bottom-left" />
        {nodeCount > 5 ? (
          <MiniMap position="bottom-right" pannable zoomable nodeColor="#e4e4e7" nodeStrokeColor="#a1a1aa" maskColor="rgb(247 247 248 / 0.7)" style={{ width: 168, height: 112 }} className="!mb-12 !mr-3 hidden xl:block" />
        ) : null}
        <Panel position="top-left" className="!m-3 flex items-center gap-2">
          <AddStepMenu
            onPick={(nodeType) => dispatch({ type: "addNode", nodeType, data: prefilledNodeData(nodeType, pipelines) })}
            label={hasSelection ? "Adds after the selected step" : "Adds at the end of the flow"}
          >
            <Button size="sm" className="shadow-card">
              <Plus /> Add step
            </Button>
          </AddStepMenu>
          <Button size="sm" variant="outline" className="bg-white shadow-card" onClick={() => fitView(FIT)} aria-label="Fit the flow to the screen" title="Fit to screen">
            <Maximize2 />
          </Button>
          <Button size="sm" variant="outline" className="bg-white shadow-card" onClick={tidyUp} aria-label="Tidy up the layout" title="Tidy up">
            <LayoutList />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-white shadow-card"
            onClick={() => onCanvasOnlyChange(!canvasOnly)}
            aria-pressed={canvasOnly}
            title={canvasOnly ? "Show the side panels" : "Hide the side panels"}
          >
            {canvasOnly ? <Shrink /> : <Expand />}
            {canvasOnly ? "Show panels" : "Full canvas"}
          </Button>
        </Panel>
        <Panel position="bottom-right" className="!m-3 hidden items-center gap-2 rounded-md bg-white/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur lg:flex">
          <span>Drag from a dot to connect</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Kbd>⌫</Kbd> removes the selection
          </span>
        </Panel>
      </ReactFlow>
    </div>
  );
}
