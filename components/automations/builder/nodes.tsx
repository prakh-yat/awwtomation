"use client";

import * as React from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import type { MatchMode, TriggerType } from "@prisma/client";
import { AlertCircle, ArrowRight, ExternalLink, ImageIcon, MousePointerClick, Plus } from "lucide-react";

import { StageDot } from "@/components/pipelines/stage-badge";
import { askQuestionFieldLabel, type FlowNodeData } from "@/lib/automation/flow-types";
import { stageColorClasses } from "@/lib/pipelines/colors";
import type { PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import type { AddableNodeType } from "./builder-state";
import { AddStepMenu, STEP_INFO } from "./step-catalog";

// ───────────────────────── Context ─────────────────────────

export type BuilderNodeContextValue = {
  nodeErrors: Map<string, string[]>;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  accountHandle: string;
  pipelines: PipelineSummary[];
  /** `${nodeId}::${handle}` for every handle that already has a connection. */
  connectedHandles: Set<string>;
  onAddAfter: (nodeId: string, handle: string, type: AddableNodeType) => void;
};

export const BuilderNodeContext = React.createContext<BuilderNodeContextValue>({
  nodeErrors: new Map(),
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: [],
  accountHandle: "@yourbrand",
  pipelines: [],
  connectedHandles: new Set(),
  onAddAfter: () => undefined,
});

// ───────────────────────── Shared shell ─────────────────────────

const TARGET_HANDLE = "!h-3 !w-3 !rounded-full !border-2 !border-foreground/60 !bg-white transition-transform hover:!scale-125";
const SOURCE_HANDLE = "!h-3 !w-3 !rounded-full !border-2 !border-white !bg-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] transition-transform hover:!scale-125";

/** The + under a free handle: pick a step and it is added and connected there. */
function AddAfter({ nodeId, handle, left = "50%", label }: { nodeId: string; handle: string; left?: string; label?: string }) {
  const { connectedHandles, onAddAfter } = React.useContext(BuilderNodeContext);
  if (connectedHandles.has(`${nodeId}::${handle}`)) return null;
  // The menu is portaled but its React events still bubble to the node, which would select it (or clear the selection on Escape).
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <div className="nodrag nopan absolute top-full z-10 flex -translate-x-1/2 flex-col items-center pt-2" style={{ left }} onClick={stop} onKeyDown={stop} onDoubleClick={stop}>
      <span aria-hidden className="h-4 w-px bg-foreground/25" />
      <AddStepMenu onPick={(type) => onAddAfter(nodeId, handle, type)} align="center" label={label}>
        <button
          type="button"
          aria-label={label ?? "Add the next step"}
          title={label ?? "Add the next step"}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-foreground/40 bg-white text-muted-foreground shadow-sm outline-none transition-colors hover:border-solid hover:border-foreground hover:bg-foreground hover:text-background focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-solid data-[state=open]:border-foreground data-[state=open]:bg-foreground data-[state=open]:text-background"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </AddStepMenu>
    </div>
  );
}

function NodeShell({
  id,
  type,
  selected,
  title,
  children,
  footer,
}: {
  id: string;
  type: FlowNodeData["type"];
  selected?: boolean;
  /** Overrides the step's catalogue name, e.g. "Comment trigger". */
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { nodeErrors } = React.useContext(BuilderNodeContext);
  const errors = nodeErrors.get(id) ?? [];
  const hasError = errors.length > 0;
  const info = STEP_INFO[type];
  const Icon = info.icon;
  const isTrigger = info.kind === "trigger";

  return (
    <div
      className={cn(
        "w-[272px] rounded-xl border bg-white text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-6px_rgb(0_0_0/0.10)] transition-[box-shadow,border-color]",
        selected ? "border-foreground shadow-[0_0_0_3px_hsl(var(--foreground)/0.12),0_10px_24px_-8px_rgb(0_0_0/0.18)]" : "border-border hover:border-foreground/35",
        hasError && !selected && "border-destructive/50",
      )}
    >
      <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            isTrigger ? "bg-foreground text-background" : "border bg-secondary/60 text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{title ?? info.label}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{info.hint}</p>
        </div>
        {hasError ? (
          <span className="shrink-0 text-destructive" title={errors.join("\n")}>
            <AlertCircle className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {children ? <div className="px-3.5 pb-3">{children}</div> : null}
      {footer}
      {hasError ? (
        <div className="flex items-start gap-1.5 rounded-b-xl border-t border-destructive/15 bg-destructive/[0.04] px-3.5 py-2 text-[11px] leading-snug text-destructive">
          <span className="line-clamp-2">{errors[0]}</span>
          {errors.length > 1 ? <span className="ml-auto shrink-0 tabular-nums">+{errors.length - 1}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] italic text-muted-foreground">{children}</p>;
}

// ───────────────────────── Nodes ─────────────────────────

type DataOf<T extends FlowNodeData["type"]> = Extract<FlowNodeData, { type: T }>;

export type TriggerNodeType = Node<DataOf<"trigger">, "trigger">;
export type MessageNodeType = Node<DataOf<"send_message">, "send_message">;
export type AskQuestionNodeType = Node<DataOf<"ask_question">, "ask_question">;
export type FollowNodeType = Node<DataOf<"condition_follow">, "condition_follow">;
export type DelayNodeType = Node<DataOf<"delay">, "delay">;
export type AddTagNodeType = Node<DataOf<"add_tag">, "add_tag">;
export type RemoveTagNodeType = Node<DataOf<"remove_tag">, "remove_tag">;
export type AddToPipelineNodeType = Node<DataOf<"add_to_pipeline">, "add_to_pipeline">;
export type MoveStageNodeType = Node<DataOf<"move_stage">, "move_stage">;
export type RemoveFromPipelineNodeType = Node<DataOf<"remove_from_pipeline">, "remove_from_pipeline">;

const TRIGGER_TITLE: Record<TriggerType, string> = { COMMENT: "Comment trigger", DM: "DM trigger", STORY_REPLY: "Story reply trigger" };
const TRIGGER_WHEN: Record<TriggerType, string> = {
  COMMENT: "When someone comments",
  DM: "When someone sends a DM",
  STORY_REPLY: "When someone replies to a story",
};
const ANY_LABEL: Record<TriggerType, string> = { COMMENT: "Any comment", DM: "Any message", STORY_REPLY: "Any story reply" };

export function TriggerNode({ id, selected }: NodeProps<TriggerNodeType>) {
  const { triggerType, matchMode, keywords, accountHandle } = React.useContext(BuilderNodeContext);
  const shown = keywords.slice(0, 4);
  return (
    <div className="relative">
      <NodeShell id={id} type="trigger" selected={selected} title={TRIGGER_TITLE[triggerType]}>
        <p className="text-[12px] text-muted-foreground">
          {TRIGGER_WHEN[triggerType]} on <span className="font-medium text-foreground">{accountHandle}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {matchMode === "ANY" ? (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium">{ANY_LABEL[triggerType]}</span>
          ) : shown.length > 0 ? (
            <>
              {shown.map((k) => (
                <span key={k} className="max-w-[9rem] truncate rounded-md border bg-white px-1.5 py-0.5 text-[11px] font-medium">
                  {k}
                </span>
              ))}
              {keywords.length > shown.length ? <span className="px-1 py-0.5 text-[11px] text-muted-foreground">+{keywords.length - shown.length}</span> : null}
            </>
          ) : (
            <Placeholder>No keywords yet</Placeholder>
          )}
        </div>
        <Handle type="source" position={Position.Bottom} id="next" className={SOURCE_HANDLE} />
      </NodeShell>
      <AddAfter nodeId={id} handle="next" label="Add the first step" />
    </div>
  );
}

export function MessageNode({ id, data, selected }: NodeProps<MessageNodeType>) {
  const updateInternals = useUpdateNodeInternals();
  const buttons = data.message.buttons ?? [];
  const quick = data.message.quickReplies ?? [];
  const text = data.message.text?.trim() ?? "";

  // Handle positions depend on how many button rows render; tell React Flow when that changes.
  React.useEffect(() => {
    updateInternals(id);
  }, [id, buttons.length, quick.length, updateInternals]);

  return (
    <div className="relative">
      <NodeShell
        id={id}
        type="send_message"
        selected={selected}
        footer={
          buttons.length > 0 || quick.length > 0 ? (
            <div className="space-y-1 px-3.5 pb-3">
              {buttons.map((b, i) => (
                <div key={`b-${i}`} className="relative flex items-center justify-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-[12px] font-medium">
                  {b.type === "web_url" ? (
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <MousePointerClick className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{b.title || `Button ${i + 1}`}</span>
                  {b.type === "postback" ? <Handle type="source" position={Position.Right} id={`btn:${i}`} className={cn(SOURCE_HANDLE, "!-right-[15px]")} /> : null}
                </div>
              ))}
              {quick.length > 0 ? (
                <div className="flex flex-col items-start gap-1 pt-0.5">
                  {quick.map((q, i) => (
                    <div key={`q-${i}`} className="relative w-full">
                      {/* Drawn as the pill Instagram shows under the message. */}
                      <span className="inline-block max-w-full truncate rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-medium">{q.title || `Quick reply ${i + 1}`}</span>
                      <Handle type="source" position={Position.Right} id={`qr:${i}`} className={cn(SOURCE_HANDLE, "!-right-[15px]")} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null
        }
      >
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        <div className="rounded-2xl rounded-tl-md bg-secondary px-3 py-2">
          {data.message.imageUrl ? (
            <p className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ImageIcon className="h-3 w-3" /> Image
            </p>
          ) : null}
          {text ? (
            <p className="line-clamp-4 whitespace-pre-wrap break-words text-[12px] leading-snug">{text}</p>
          ) : (
            <Placeholder>{data.message.imageUrl ? "Image only" : "Write the message"}</Placeholder>
          )}
        </div>
        <Handle type="source" position={Position.Bottom} id="next" className={SOURCE_HANDLE} title="Continues after this message" />
      </NodeShell>
      <AddAfter nodeId={id} handle="next" />
    </div>
  );
}

export function AskQuestionNode({ id, data, selected }: NodeProps<AskQuestionNodeType>) {
  const text = data.prompt.text?.trim() ?? "";
  const quick = data.prompt.quickReplies ?? [];
  const field = data.saveTo.trim();
  return (
    <div className="relative">
      <NodeShell
        id={id}
        type="ask_question"
        selected={selected}
        footer={
          <div className="flex items-center gap-1.5 border-t px-3.5 py-2 text-[11px] text-muted-foreground">
            <ArrowRight className="h-3 w-3 shrink-0" />
            {field ? (
              <span className="truncate">
                Saves to <span className="font-medium text-foreground">{askQuestionFieldLabel(field)}</span>
              </span>
            ) : (
              <span className="italic">No field chosen</span>
            )}
          </div>
        }
      >
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        <div className="rounded-2xl rounded-tl-md bg-secondary px-3 py-2">
          {text ? <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-snug">{text}</p> : <Placeholder>Write the question</Placeholder>}
        </div>
        {quick.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {quick.map((q, i) => (
              <span key={i} className="max-w-full truncate rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium">
                {q.title || `Option ${i + 1}`}
              </span>
            ))}
          </div>
        ) : null}
        <Handle type="source" position={Position.Bottom} id="next" className={SOURCE_HANDLE} title="Continues when they answer" />
      </NodeShell>
      <AddAfter nodeId={id} handle="next" />
    </div>
  );
}

export function FollowConditionNode({ id, selected }: NodeProps<FollowNodeType>) {
  const { accountHandle } = React.useContext(BuilderNodeContext);
  return (
    <div className="relative">
      <NodeShell
        id={id}
        type="condition_follow"
        selected={selected}
        footer={
          <div className="relative grid grid-cols-2 border-t text-center text-[11px] font-medium">
            <span className="border-r py-2 text-foreground">Following</span>
            <span className="py-2 text-muted-foreground">Not following</span>
            <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "25%" }} className={SOURCE_HANDLE} />
            <Handle type="source" position={Position.Bottom} id="no" style={{ left: "75%" }} className={SOURCE_HANDLE} />
          </div>
        }
      >
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        <p className="text-[12px] text-muted-foreground">
          Is the contact following <span className="font-medium text-foreground">{accountHandle}</span>?
        </p>
      </NodeShell>
      <AddAfter nodeId={id} handle="yes" left="25%" label="Add a step for followers" />
      <AddAfter nodeId={id} handle="no" left="75%" label="Add a step for everyone else" />
    </div>
  );
}

function formatSeconds(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function DelayNode({ id, data, selected }: NodeProps<DelayNodeType>) {
  return (
    <div className="relative">
      <NodeShell id={id} type="delay" selected={selected}>
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        <p className="text-[12px]">
          Wait <span className="rounded-md bg-secondary px-1.5 py-0.5 font-semibold">{formatSeconds(data.seconds)}</span> then continue
        </p>
        <Handle type="source" position={Position.Bottom} id="next" className={SOURCE_HANDLE} />
      </NodeShell>
      <AddAfter nodeId={id} handle="next" />
    </div>
  );
}

function TagNodeBody({ id, tag, selected, type }: { id: string; tag: string; selected?: boolean; type: "add_tag" | "remove_tag" }) {
  return (
    <div className="relative">
      <NodeShell id={id} type={type} selected={selected}>
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        {tag.trim() ? (
          <span className={cn("inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 text-[12px] font-medium", type === "remove_tag" ? "bg-white line-through decoration-foreground/40" : "bg-secondary")}>
            {tag}
          </span>
        ) : (
          <Placeholder>Pick a tag</Placeholder>
        )}
        <Handle type="source" position={Position.Bottom} id="next" className={SOURCE_HANDLE} />
      </NodeShell>
      <AddAfter nodeId={id} handle="next" />
    </div>
  );
}

export function AddTagNode({ id, data, selected }: NodeProps<AddTagNodeType>) {
  return <TagNodeBody id={id} tag={data.tag} selected={selected} type="add_tag" />;
}

export function RemoveTagNode({ id, data, selected }: NodeProps<RemoveTagNodeType>) {
  return <TagNodeBody id={id} tag={data.tag} selected={selected} type="remove_tag" />;
}

function PipelineNodeBody({ id, data, selected }: { id: string; data: DataOf<"add_to_pipeline"> | DataOf<"move_stage"> | DataOf<"remove_from_pipeline">; selected?: boolean }) {
  const { pipelines } = React.useContext(BuilderNodeContext);
  const pipeline = data.pipelineId ? pipelines.find((p) => p.id === data.pipelineId) : undefined;
  const stage = data.type !== "remove_from_pipeline" && pipeline ? pipeline.stages.find((s) => s.id === data.stageId) : undefined;

  let body: React.ReactNode;
  if (!data.pipelineId) body = <Placeholder>Pick a pipeline</Placeholder>;
  else if (!pipeline) body = <p className="text-[12px] text-destructive">That pipeline was deleted</p>;
  else if (data.type === "remove_from_pipeline") {
    body = (
      <p className="text-[12px] text-muted-foreground">
        Out of <span className="font-medium text-foreground">{pipeline.name}</span>
      </p>
    );
  } else {
    body = (
      <div className="space-y-1.5">
        <p className="truncate text-[12px] text-muted-foreground">
          {data.type === "add_to_pipeline" ? "Into" : "In"} <span className="font-medium text-foreground">{pipeline.name}</span>
        </p>
        {stage ? (
          <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset", stageColorClasses(stage.color).pill)}>
            <StageDot color={stage.color} />
            <span className="truncate">{data.type === "add_to_pipeline" ? `Starts at ${stage.name}` : `Moves to ${stage.name}`}</span>
          </span>
        ) : data.stageId ? (
          <p className="text-[12px] text-destructive">That stage was deleted</p>
        ) : (
          <Placeholder>Pick a stage</Placeholder>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <NodeShell id={id} type={data.type} selected={selected}>
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        {body}
        <Handle type="source" position={Position.Bottom} id="next" className={SOURCE_HANDLE} />
      </NodeShell>
      <AddAfter nodeId={id} handle="next" />
    </div>
  );
}

export function AddToPipelineNode({ id, data, selected }: NodeProps<AddToPipelineNodeType>) {
  return <PipelineNodeBody id={id} data={data} selected={selected} />;
}

export function MoveStageNode({ id, data, selected }: NodeProps<MoveStageNodeType>) {
  return <PipelineNodeBody id={id} data={data} selected={selected} />;
}

export function RemoveFromPipelineNode({ id, data, selected }: NodeProps<RemoveFromPipelineNodeType>) {
  return <PipelineNodeBody id={id} data={data} selected={selected} />;
}

export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  send_message: MessageNode,
  ask_question: AskQuestionNode,
  condition_follow: FollowConditionNode,
  delay: DelayNode,
  add_tag: AddTagNode,
  remove_tag: RemoveTagNode,
  add_to_pipeline: AddToPipelineNode,
  move_stage: MoveStageNode,
  remove_from_pipeline: RemoveFromPipelineNode,
};
