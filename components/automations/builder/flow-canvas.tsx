"use client";

import "@xyflow/react/dist/style.css";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { HelpCircle, MessageSquare, Plus, Tag, TagIcon, Timer, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";

import { EDGE_DEFAULTS, type AddableNodeType, type BuilderAction, type BuilderEdge, type BuilderNode } from "./builder-state";
import { nodeTypes } from "./nodes";

const ADDABLE: Array<{ type: AddableNodeType; label: string; icon: typeof Plus; hint: string }> = [
  { type: "send_message", label: "Send message", icon: MessageSquare, hint: "Text, buttons, image" },
  { type: "ask_question", label: "Ask a question", icon: HelpCircle, hint: "Save their reply to the contact" },
  { type: "condition_follow", label: "Follow gate", icon: UserCheck, hint: "Branch on follow status" },
  { type: "delay", label: "Delay", icon: Timer, hint: "Wait before the next step" },
  { type: "add_tag", label: "Add tag", icon: Tag, hint: "Tag the contact" },
  { type: "remove_tag", label: "Remove tag", icon: TagIcon, hint: "Untag the contact" },
];

export type FlowCanvasProps = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  dispatch: React.Dispatch<BuilderAction>;
};

/**
 * React Flow surface. Everything mutable goes through `dispatch`; the canvas
 * itself is stateless apart from the viewport, which React Flow owns.
 */
export function FlowCanvas({ nodes, edges, dispatch }: FlowCanvasProps) {
  const { fitView } = useReactFlow();
  const nodeCount = nodes.length;

  React.useEffect(() => {
    // Re-frame when the graph grows so a freshly added step is never off-screen.
    const t = setTimeout(() => fitView({ padding: 0.25, maxZoom: 1, duration: 200 }), 30);
    return () => clearTimeout(t);
  }, [nodeCount, fitView]);

  const onNodesChange = React.useCallback((changes: NodeChange<BuilderNode>[]) => dispatch({ type: "nodesChange", changes }), [dispatch]);
  const onEdgesChange = React.useCallback((changes: EdgeChange<BuilderEdge>[]) => dispatch({ type: "edgesChange", changes }), [dispatch]);
  const onConnect = React.useCallback((connection: Connection) => dispatch({ type: "connect", connection }), [dispatch]);

  return (
    <div
      className={[
        "h-full w-full bg-[#fafafa]",
        // Monochrome overrides for React Flow's default chrome.
        "[&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-md [&_.react-flow__controls]:border [&_.react-flow__controls]:shadow-card",
        "[&_.react-flow__controls-button]:border-b [&_.react-flow__controls-button]:border-border [&_.react-flow__controls-button]:bg-white [&_.react-flow__controls-button:hover]:bg-secondary",
        "[&_.react-flow__controls-button_svg]:fill-foreground",
        "[&_.react-flow__edge.selected_.react-flow__edge-path]:!stroke-[2.5px]",
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
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        snapToGrid
        snapGrid={[8, 8]}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4d4d4" />
        <Controls showInteractive={false} position="bottom-left" />
        <Panel position="top-left" className="!m-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus /> Add step
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Add after the selected step</DropdownMenuLabel>
              {ADDABLE.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.type} onSelect={() => dispatch({ type: "addNode", nodeType: item.type })}>
                    <Icon />
                    <span className="flex flex-col">
                      <span>{item.label}</span>
                      <span className="text-[11px] text-muted-foreground">{item.hint}</span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </Panel>
        <Panel position="bottom-right" className="!m-3 hidden items-center gap-2 text-[11px] text-muted-foreground lg:flex">
          <span>Drag from a handle to connect</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Kbd>⌫</Kbd> removes the selection
          </span>
        </Panel>
      </ReactFlow>
    </div>
  );
}
