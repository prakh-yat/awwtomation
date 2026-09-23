"use client";

import * as React from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import type { ChannelPlatform, MatchMode, TriggerType } from "@prisma/client";
import { AlertCircle, ExternalLink, ImageIcon, MousePointerClick, Plus } from "lucide-react";

import { StageDot } from "@/components/pipelines/stage-badge";
import { TONES } from "@/components/ui/tone";
import { askQuestionFieldLabel, DEFAULT_AI_TURNS, type FlowNodeData } from "@/lib/automation/flow-types";
import { stageColorClasses } from "@/lib/pipelines/colors";
import type { AgentOption } from "@/lib/services/ai";
import type { PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import type { AddableNodeType } from "./builder-state";
import { AddStepMenu, STEP_INFO, StepIcon } from "./step-catalog";

// ───────────────────────── Context ─────────────────────────

export type BuilderNodeContextValue = {
  nodeErrors: Map<string, string[]>;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  accountHandle: string;
  platform: ChannelPlatform | null;
  pipelines: PipelineSummary[];
  /** `${nodeId}::${handle}` for every handle that already has a connection. */
  connectedHandles: Set<string>;
  onAddAfter: (nodeId: string, handle: string, type: AddableNodeType) => void;
  /** The workspace's AI agents, for the AI reply node's summary line. */
  agents: AgentOption[];
};

export const BuilderNodeContext = React.createContext<BuilderNodeContextValue>({
  nodeErrors: new Map(),
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: [],
  accountHandle: "@yourbrand",
  platform: null,
  pipelines: [],
  connectedHandles: new Set(),
  onAddAfter: () => undefined,
  agents: [],
});

// ───────────────────────── Shared shell ─────────────────────────

const TARGET_HANDLE = "!h-3 !w-3 !rounded-full !border-2 !border-ink/50 !bg-white";
const SOURCE_HANDLE = "!h-3 !w-3 !rounded-full !border-2 !border-white !bg-ink shadow-[0_0_0_1px_hsl(var(--brand-ink)/0.6)] hover:!bg-purple";

/** The + under a free handle: pick a step and it is added and connected there. */
function AddAfter({ nodeId, handle, left = "50%", label }: { nodeId: string; handle: string; left?: string; label?: string }) {
  const { connectedHandles, onAddAfter, platform } = React.useContext(BuilderNodeContext);
  if (connectedHandles.has(`${nodeId}::${handle}`)) return null;
  // The menu is portaled but its React events still bubble to the node, which would select it (or clear the selection on Escape).
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <div className="nodrag nopan absolute top-full z-10 flex -translate-x-1/2 flex-col items-center pt-1.5" style={{ left }} onClick={stop} onKeyDown={stop} onDoubleClick={stop}>
      <span aria-hidden className="h-4 w-px bg-ink/25" />
      <AddStepMenu onPick={(type) => onAddAfter(nodeId, handle, type)} align="center" label={label} platform={platform}>
        <button
          type="button"
          aria-label={label ?? "Add the next step"}
          title={label ?? "Add the next step"}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-ink/35 bg-white text-muted-foreground outline-none transition-[transform,background-color,color,border-color] duration-150 hover:scale-110 hover:border-solid hover:border-purple hover:bg-purple hover:text-white focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:scale-110 data-[state=open]:border-solid data-[state=open]:border-purple data-[state=open]:bg-purple data-[state=open]:text-white"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
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
  subtitle,
  children,
  footer,
  note,
}: {
  id: string;
  type: FlowNodeData["type"];
  selected?: boolean;
  /** Overrides the step's catalogue name, e.g. "Comment trigger". */
  title?: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** A non-blocking remark, shown above errors. */
  note?: string | null;
}) {
  const { nodeErrors } = React.useContext(BuilderNodeContext);
  const errors = nodeErrors.get(id) ?? [];
  const hasError = errors.length > 0;
  const info = STEP_INFO[type];
  const isTrigger = type === "trigger";

  return (
    <div
      className={cn(
        "node-pop w-[272px] overflow-hidden rounded-2xl border-2 bg-white text-[13px] transition-[box-shadow,border-color] duration-150",
        "shadow-[0_1px_2px_rgb(15_15_15/0.05),0_10px_24px_-14px_rgb(15_15_15/0.25)]",
        selected ? "border-purple shadow-[0_0_0_4px_hsl(var(--brand-purple)/0.14),0_16px_32px_-16px_rgb(15_15_15/0.35)]" : hasError ? "border-destructive/50" : "border-transparent ring-1 ring-ink/10 hover:ring-ink/25",
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-3 py-2.5", isTrigger ? TONES.yellow.solid : type === "ai_reply" ? "bg-ink text-white" : TONES[info.tone].soft)}>
        <StepIcon type={type} size={28} className={isTrigger ? "bg-ink text-yellow" : type === "ai_reply" ? "bg-white text-ink" : undefined} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold leading-tight", isTrigger || type === "ai_reply" ? null : "text-ink")}>{title ?? info.label}</p>
          {subtitle ? <p className={cn("truncate text-[11px] leading-tight", isTrigger ? "text-ink/70" : type === "ai_reply" ? "text-white/65" : "text-ink/60")}>{subtitle}</p> : null}
        </div>
        {hasError ? (
          <span className={cn("shrink-0", isTrigger || type === "ai_reply" ? "text-destructive" : "text-destructive")} title={errors.join("\n")}>
            <AlertCircle className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {children ? <div className="px-3 pb-3 pt-2.5">{children}</div> : null}
      {footer}
      {note && !hasError ? <div className="border-t bg-yellow-soft/70 px-3 py-2 text-[11px] leading-snug text-ink">{note}</div> : null}
      {hasError ? (
        <div className="flex items-start gap-1.5 border-t border-destructive/15 bg-destructive/[0.05] px-3 py-2 text-[11px] leading-snug text-destructive">
          <span className="line-clamp-2">{errors[0]}</span>
          {errors.length > 1 ? <span className="ml-auto shrink-0 tabular-nums">+{errors.length - 1}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted-foreground">{children}</p>;
}

/** The business's message as the contact sees it, in miniature. */
function Bubble({ children, empty }: { children?: React.ReactNode; empty?: string }) {
  return (
    <div className="rounded-2xl rounded-tl-md bg-fog px-3 py-2">
      {children ?? <Placeholder>{empty}</Placeholder>}
    </div>
  );
}

// ───────────────────────── Nodes ─────────────────────────

type DataOf<T extends FlowNodeData["type"]> = Extract<FlowNodeData, { type: T }>;

export type TriggerNodeType = Node<DataOf<"trigger">, "trigger">;
export type MessageNodeType = Node<DataOf<"send_message">, "send_message">;
export type AskQuestionNodeType = Node<DataOf<"ask_question">, "ask_question">;
export type AiReplyNodeType = Node<DataOf<"ai_reply">, "ai_reply">;
export type FollowNodeType = Node<DataOf<"condition_follow">, "condition_follow">;
export type DelayNodeType = Node<DataOf<"delay">, "delay">;
export type AddTagNodeType = Node<DataOf<"add_tag">, "add_tag">;
export type RemoveTagNodeType = Node<DataOf<"remove_tag">, "remove_tag">;
export type AddToPipelineNodeType = Node<DataOf<"add_to_pipeline">, "add_to_pipeline">;
export type MoveStageNodeType = Node<DataOf<"move_stage">, "move_stage">;
export type RemoveFromPipelineNodeType = Node<DataOf<"remove_from_pipeline">, "remove_from_pipeline">;

const TRIGGER_TITLE: Record<TriggerType, string> = { COMMENT: "When someone comments", DM: "When someone sends a DM", STORY_REPLY: "When someone replies to a story" };
const ANY_LABEL: Record<TriggerType, string> = { COMMENT: "Any comment", DM: "Any message", STORY_REPLY: "Any story reply" };

export function TriggerNode({ id, selected }: NodeProps<TriggerNodeType>) {
  const { triggerType, matchMode, keywords, accountHandle } = React.useContext(BuilderNodeContext);
  const shown = keywords.slice(0, 5);
  return (
    <div className="relative">
      <NodeShell id={id} type="trigger" selected={selected} title={TRIGGER_TITLE[triggerType]} subtitle={accountHandle}>
        <div className="flex flex-wrap gap-1">
          {matchMode === "ANY" ? (
            <span className="rounded-full bg-yellow-soft px-2 py-0.5 text-[11px] font-semibold">{ANY_LABEL[triggerType]}</span>
          ) : shown.length > 0 ? (
            <>
              {shown.map((k) => (
                <span key={k} className="max-w-[9rem] truncate rounded-full bg-yellow-soft px-2 py-0.5 text-[11px] font-semibold">
                  {k}
                </span>
              ))}
              {keywords.length > shown.length ? <span className="px-1 py-0.5 text-[11px] text-muted-foreground">+{keywords.length - shown.length}</span> : null}
            </>
          ) : (
            <Placeholder>Add keywords</Placeholder>
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
            <div className="space-y-1 px-3 pb-3">
              {buttons.map((b, i) => (
                <div key={`b-${i}`} className="relative flex items-center justify-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 text-[12px] font-semibold text-purple-ink">
                  {b.type === "web_url" ? <ExternalLink className="h-3 w-3 shrink-0" /> : <MousePointerClick className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{b.title || `Button ${i + 1}`}</span>
                  {b.type === "postback" ? <Handle type="source" position={Position.Right} id={`btn:${i}`} className={cn(SOURCE_HANDLE, "!-right-[17px]")} /> : null}
                </div>
              ))}
              {quick.length > 0 ? (
                <div className="flex flex-col items-start gap-1 pt-0.5">
                  {quick.map((q, i) => (
                    <div key={`q-${i}`} className="relative w-full">
                      {/* Drawn as the pill the platform shows under the message. */}
                      <span className="inline-block max-w-full truncate rounded-full border border-purple/40 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-purple-ink">
                        {q.title || `Quick reply ${i + 1}`}
                      </span>
                      <Handle type="source" position={Position.Right} id={`qr:${i}`} className={cn(SOURCE_HANDLE, "!-right-[17px]")} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null
        }
      >
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        <Bubble empty={data.message.imageUrl ? "Image only" : "Write the message"}>
          {data.message.imageUrl ? (
            <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <ImageIcon className="h-3 w-3" /> Image
            </p>
          ) : null}
          {text ? <p className="line-clamp-4 whitespace-pre-wrap break-words text-[12px] leading-snug">{text}</p> : data.message.imageUrl ? null : <Placeholder>Write the message</Placeholder>}
        </Bubble>
        <Handle type="source" position={Position.Bottom} id="next" className={SOURCE_HANDLE} title="Continues when they reply" />
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
      <NodeShell id={id} type="ask_question" selected={selected} subtitle={field ? `Saves to ${askQuestionFieldLabel(field)}` : "Pick where to save it"}>
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        <Bubble empty="Write the question">{text ? <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-snug">{text}</p> : undefined}</Bubble>
        {quick.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {quick.map((q, i) => (
              <span key={i} className="max-w-full truncate rounded-full border border-sky bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-ink">
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

function BranchFooter({ left, right, leftHandle, rightHandle }: { left: string; right: string; leftHandle: string; rightHandle: string }) {
  return (
    <div className="relative grid grid-cols-2 border-t text-center text-[11px] font-semibold">
      <span className="border-r py-2 text-green-ink">{left}</span>
      <span className="py-2 text-orange-ink">{right}</span>
      <Handle type="source" position={Position.Bottom} id={leftHandle} style={{ left: "25%" }} className={SOURCE_HANDLE} />
      <Handle type="source" position={Position.Bottom} id={rightHandle} style={{ left: "75%" }} className={SOURCE_HANDLE} />
    </div>
  );
}

export function AiReplyNode({ id, data, selected }: NodeProps<AiReplyNodeType>) {
  const { agents } = React.useContext(BuilderNodeContext);
  const agent = agents.find((a) => a.id === data.agentId) ?? agents.find((a) => a.isDefault);
  const turns = data.maxTurns ?? DEFAULT_AI_TURNS;

  return (
    <div className="relative">
      <NodeShell
        id={id}
        type="ai_reply"
        selected={selected}
        subtitle={agent ? `${agent.name}, up to ${turns} ${turns === 1 ? "reply" : "replies"}` : "Pick an agent"}
        footer={<BranchFooter left="Done" right="Needs a human" leftHandle="next" rightHandle="handoff" />}
      >
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
        {data.instruction?.trim() ? (
          <p className="line-clamp-2 text-[12px] text-muted-foreground">{data.instruction.trim()}</p>
        ) : (
          <Placeholder>Answers in your agent&apos;s words</Placeholder>
        )}
      </NodeShell>
      <AddAfter nodeId={id} handle="next" left="25%" label="When it is done" />
      <AddAfter nodeId={id} handle="handoff" left="75%" label="When it needs a human" />
    </div>
  );
}

export function FollowConditionNode({ id, selected }: NodeProps<FollowNodeType>) {
  const { accountHandle, platform } = React.useContext(BuilderNodeContext);
  return (
    <div className="relative">
      <NodeShell
        id={id}
        type="condition_follow"
        selected={selected}
        subtitle={`Do they follow ${accountHandle}?`}
        note={platform === "FACEBOOK" ? "Facebook has no followers, so everyone takes the Following path." : null}
        footer={<BranchFooter left="Following" right="Not following" leftHandle="yes" rightHandle="no" />}
      >
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
      </NodeShell>
      <AddAfter nodeId={id} handle="yes" left="25%" label="For followers" />
      <AddAfter nodeId={id} handle="no" left="75%" label="For everyone else" />
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
      <NodeShell id={id} type="delay" selected={selected} title={`Wait ${formatSeconds(data.seconds)}`} subtitle="Then continues">
        <Handle type="target" position={Position.Top} className={TARGET_HANDLE} />
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
          <span className={cn("inline-flex max-w-full items-center truncate rounded-full bg-green-soft px-2 py-0.5 text-[12px] font-semibold text-green-ink", type === "remove_tag" && "line-through decoration-green-ink/50")}>
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
  else if (data.type === "remove_from_pipeline") body = null;
  else if (stage) {
    body = (
      <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset", stageColorClasses(stage.color).pill)}>
        <StageDot color={stage.color} />
        <span className="truncate">{stage.name}</span>
      </span>
    );
  } else body = data.stageId ? <p className="text-[12px] text-destructive">That stage was deleted</p> : <Placeholder>Pick a stage</Placeholder>;

  return (
    <div className="relative">
      <NodeShell id={id} type={data.type} selected={selected} subtitle={pipeline ? pipeline.name : undefined}>
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
  ai_reply: AiReplyNode,
  condition_follow: FollowConditionNode,
  delay: DelayNode,
  add_tag: AddTagNode,
  remove_tag: RemoveTagNode,
  add_to_pipeline: AddToPipelineNode,
  move_stage: MoveStageNode,
  remove_from_pipeline: RemoveFromPipelineNode,
};
