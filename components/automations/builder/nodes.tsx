"use client";

import * as React from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import type { TriggerType } from "@prisma/client";
import { AlertCircle, ArrowRight, ExternalLink, HelpCircle, ImageIcon, MessageSquare, MousePointerClick, Tag, TagIcon, Timer, UserCheck, Zap } from "lucide-react";

import { triggerTypeLabel } from "@/components/automations/badges";
import { askQuestionFieldLabel, type FlowNodeData } from "@/lib/automation/flow-types";
import { cn } from "@/lib/utils";

// ───────────────────────── Context ─────────────────────────

export type BuilderNodeContextValue = {
  nodeErrors: Map<string, string[]>;
  triggerType: TriggerType;
  /** e.g. "link, guide" or "any comment" — shown on the trigger node. */
  triggerSummary: string;
  accountHandle: string;
};

export const BuilderNodeContext = React.createContext<BuilderNodeContextValue>({
  nodeErrors: new Map(),
  triggerType: "COMMENT",
  triggerSummary: "",
  accountHandle: "@yourbrand",
});

// ───────────────────────── Shared shell ─────────────────────────

const HANDLE_CLASS = "!h-3 !w-3 !rounded-full !border-2 !border-foreground !bg-white";

function NodeShell({
  id,
  selected,
  icon: Icon,
  title,
  children,
  footer,
  className,
}: {
  id: string;
  selected?: boolean;
  icon: typeof Zap;
  title: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { nodeErrors } = React.useContext(BuilderNodeContext);
  const errors = nodeErrors.get(id) ?? [];
  const hasError = errors.length > 0;
  return (
    <div
      className={cn(
        "w-[240px] rounded-lg border bg-white text-[13px] shadow-card transition-[box-shadow,border-color]",
        selected ? "border-foreground ring-2 ring-foreground/15" : "border-border hover:border-foreground/40",
        hasError && !selected && "border-destructive/60",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-foreground text-white">
          <Icon className="h-3 w-3" strokeWidth={2} />
        </span>
        <span className="truncate font-medium">{title}</span>
        {hasError ? (
          <span className="ml-auto text-destructive" title={errors.join("\n")}>
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      {children ? <div className="px-3 py-2">{children}</div> : null}
      {footer}
    </div>
  );
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

const TRIGGER_HINT: Record<TriggerType, string> = {
  COMMENT: "When someone comments",
  DM: "When someone sends a DM",
  STORY_REPLY: "When someone replies to a story",
};

export function TriggerNode({ id, selected }: NodeProps<TriggerNodeType>) {
  const { triggerType, triggerSummary } = React.useContext(BuilderNodeContext);
  return (
    <NodeShell id={id} selected={selected} icon={Zap} title={`${triggerTypeLabel(triggerType)} trigger`}>
      <p className="text-[12px] text-muted-foreground">{TRIGGER_HINT[triggerType]}</p>
      {triggerSummary ? <p className="mt-1 truncate text-[12px] font-medium">{triggerSummary}</p> : null}
      <Handle type="source" position={Position.Bottom} id="next" className={HANDLE_CLASS} />
    </NodeShell>
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
    <NodeShell
      id={id}
      selected={selected}
      icon={MessageSquare}
      title="Send message"
      footer={
        buttons.length > 0 || quick.length > 0 ? (
          <div className="border-t">
            {buttons.map((b, i) => (
              <div key={`b-${i}`} className="relative flex items-center gap-1.5 border-b px-3 py-1.5 text-[12px] last:border-b-0">
                {b.type === "web_url" ? (
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <MousePointerClick className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{b.title || `Button ${i + 1}`}</span>
                {b.type === "postback" ? <Handle type="source" position={Position.Right} id={`btn:${i}`} className={HANDLE_CLASS} /> : null}
              </div>
            ))}
            {quick.map((q, i) => (
              <div key={`q-${i}`} className="relative flex items-center gap-1.5 border-b px-3 py-1.5 text-[12px] last:border-b-0">
                <span className="rounded-full border px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">QR</span>
                <span className="truncate">{q.title || `Quick reply ${i + 1}`}</span>
                <Handle type="source" position={Position.Right} id={`qr:${i}`} className={HANDLE_CLASS} />
              </div>
            ))}
          </div>
        ) : null
      }
    >
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      {data.message.imageUrl ? (
        <p className="mb-1 inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
          <ImageIcon className="h-3 w-3" /> Image
        </p>
      ) : null}
      {text ? (
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-snug">{text}</p>
      ) : (
        <p className="text-[12px] italic text-muted-foreground">{data.message.imageUrl ? "Image only" : "No text yet"}</p>
      )}
      <Handle type="source" position={Position.Bottom} id="next" className={HANDLE_CLASS} title="Continues when they reply" />
    </NodeShell>
  );
}

export function AskQuestionNode({ id, data, selected }: NodeProps<AskQuestionNodeType>) {
  const text = data.prompt.text?.trim() ?? "";
  const quick = data.prompt.quickReplies ?? [];
  const field = data.saveTo.trim();
  return (
    <NodeShell
      id={id}
      selected={selected}
      icon={HelpCircle}
      title="Ask a question"
      footer={
        <div className="flex items-center gap-1 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <ArrowRight className="h-3 w-3 shrink-0" />
          {field ? (
            <span className="truncate">
              saves to <span className="font-medium text-foreground">{askQuestionFieldLabel(field)}</span>
            </span>
          ) : (
            <span className="italic">no field chosen</span>
          )}
        </div>
      }
    >
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      {text ? (
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-snug">{text}</p>
      ) : (
        <p className="text-[12px] italic text-muted-foreground">No question yet</p>
      )}
      {quick.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {quick.map((q, i) => (
            <span key={i} className="max-w-full truncate rounded-full border bg-white px-1.5 py-0.5 text-[10px] font-medium">
              {q.title || `Option ${i + 1}`}
            </span>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} id="next" className={HANDLE_CLASS} title="Continues when they answer" />
    </NodeShell>
  );
}

export function FollowConditionNode({ id, selected }: NodeProps<FollowNodeType>) {
  const { accountHandle } = React.useContext(BuilderNodeContext);
  return (
    <NodeShell
      id={id}
      selected={selected}
      icon={UserCheck}
      title="Follow gate"
      footer={
        <div className="relative grid grid-cols-2 border-t text-center text-[11px] text-muted-foreground">
          <span className="border-r py-1.5">Following</span>
          <span className="py-1.5">Not following</span>
          <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "25%" }} className={HANDLE_CLASS} />
          <Handle type="source" position={Position.Bottom} id="no" style={{ left: "75%" }} className={HANDLE_CLASS} />
        </div>
      }
    >
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      <p className="text-[12px] text-muted-foreground">
        Is the contact following <span className="font-medium text-foreground">{accountHandle}</span>?
      </p>
    </NodeShell>
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
    <NodeShell id={id} selected={selected} icon={Timer} title="Wait">
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      <p className="text-[12px]">
        Wait <span className="font-medium">{formatSeconds(data.seconds)}</span> before the next step
      </p>
      <Handle type="source" position={Position.Bottom} id="next" className={HANDLE_CLASS} />
    </NodeShell>
  );
}

function TagNodeBody({ id, tag, selected, add }: { id: string; tag: string; selected?: boolean; add: boolean }) {
  return (
    <NodeShell id={id} selected={selected} icon={add ? Tag : TagIcon} title={add ? "Add tag" : "Remove tag"}>
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      {tag.trim() ? (
        <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[12px] font-medium">{tag}</span>
      ) : (
        <p className="text-[12px] italic text-muted-foreground">No tag yet</p>
      )}
      <Handle type="source" position={Position.Bottom} id="next" className={HANDLE_CLASS} />
    </NodeShell>
  );
}

export function AddTagNode({ id, data, selected }: NodeProps<AddTagNodeType>) {
  return <TagNodeBody id={id} tag={data.tag} selected={selected} add />;
}

export function RemoveTagNode({ id, data, selected }: NodeProps<RemoveTagNodeType>) {
  return <TagNodeBody id={id} tag={data.tag} selected={selected} add={false} />;
}

export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  send_message: MessageNode,
  ask_question: AskQuestionNode,
  condition_follow: FollowConditionNode,
  delay: DelayNode,
  add_tag: AddTagNode,
  remove_tag: RemoveTagNode,
};
