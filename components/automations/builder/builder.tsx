"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { AlertTriangle, ArrowLeft, BarChart3, Copy, FlaskConical, MoreHorizontal, Pause, Play, Trash2, Workflow } from "lucide-react";

import { apiFetch, ApiClientError, errorMessage } from "@/components/automations/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeFlowErrors, normalizeHandle, validateFlow } from "@/lib/automation/flow-types";
import type { AgentOption } from "@/lib/services/ai";
import type { AutomationDetail, ChannelOption, UpdateAutomationResult } from "@/lib/services/automations";
import type { PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import { builderReducer, conversationPreview, initBuilderState, isDirty, nodeErrorsFrom, prefilledNodeData, toFlowGraph, type AddableNodeType } from "./builder-state";
import { FlowCanvas } from "./flow-canvas";
import { Inspector } from "./inspector";
import { BuilderNodeContext } from "./nodes";
import { TestDialog } from "./test-dialog";
import { TriggerPanel } from "./trigger-panel";

export type AutomationBuilderProps = {
  automation: AutomationDetail;
  channels: ChannelOption[];
  pipelines: PipelineSummary[];
  agents: AgentOption[];
};

function handleFor(channel: ChannelOption | undefined): string {
  if (!channel) return "@yourbrand";
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? "@yourbrand";
}

const CONTACT_LABEL: Record<AutomationDetail["triggerType"], string> = { COMMENT: "Their comment", DM: "Their message", STORY_REPLY: "Their story reply" };

/** Keyboard shortcuts belong to the canvas, not to whatever field has focus. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"));
}

function StatusBadge({ status }: { status: AutomationDetail["status"] }) {
  if (status === "ACTIVE")
    return (
      <Badge variant="success" dot="pulse">
        Live
      </Badge>
    );
  if (status === "PAUSED") return <Badge variant="yellow">Paused</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
}

export function AutomationBuilder({ automation, channels, pipelines, agents }: AutomationBuilderProps) {
  const router = useRouter();
  const [state, dispatch] = React.useReducer(builderReducer, automation, initBuilderState);
  const [saving, setSaving] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  // Hides the settings and inspector panels so the canvas gets the whole width.
  const [canvasOnly, setCanvasOnly] = React.useState(false);

  const { settings, nodes, edges, selectedNodeId, status, mediaById, history } = state;
  const channel = channels.find((c) => c.id === settings.channelId);
  const platform = channel?.platform ?? null;
  const accountHandle = handleFor(channel);

  const flow = React.useMemo(() => toFlowGraph(nodes, edges), [nodes, edges]);
  const flowErrors = React.useMemo(() => {
    const validation = validateFlow(flow);
    return validation.ok ? [] : validation.errors;
  }, [flow]);
  // Pinned to their step by id, then worded with step names for display.
  const nodeErrors = React.useMemo(() => {
    const described = new Map<string, string[]>();
    for (const [id, list] of nodeErrorsFrom(flowErrors, nodes)) described.set(id, describeFlowErrors(list, flow));
    return described;
  }, [flowErrors, nodes, flow]);
  const dirty = isDirty(state);

  // Same rules as the server's activation check, so the user sees blockers before pressing Activate.
  const blockers = React.useMemo(() => {
    const out: string[] = [];
    if (!channel) out.push("Pick an account.");
    else if (channel.status !== "ACTIVE") out.push("Reconnect this account from the dashboard.");
    if (platform === "FACEBOOK" && settings.triggerType === "STORY_REPLY") out.push("Story replies only happen on Instagram. Pick Comment or DM.");
    out.push(...describeFlowErrors(flowErrors, flow));
    if (settings.matchMode !== "ANY" && settings.keywords.length === 0) out.push("Add at least one keyword, or match any text.");
    return out;
  }, [channel, platform, flowErrors, flow, settings.matchMode, settings.keywords.length, settings.triggerType]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const conversation = React.useMemo(() => conversationPreview(nodes, edges, accountHandle), [nodes, edges, accountHandle]);
  const connectedHandles = React.useMemo(() => new Set(edges.map((e) => `${e.source}::${normalizeHandle(e.sourceHandle)}`)), [edges]);
  const onAddAfter = React.useCallback(
    (nodeId: string, handle: string, nodeType: AddableNodeType) => dispatch({ type: "addNode", nodeType, data: prefilledNodeData(nodeType, pipelines), after: { nodeId, handle } }),
    [pipelines],
  );
  const nodeContext = React.useMemo(
    () => ({
      nodeErrors,
      triggerType: settings.triggerType,
      matchMode: settings.matchMode,
      keywords: settings.keywords,
      accountHandle,
      platform,
      pipelines,
      agents,
      connectedHandles,
      onAddAfter,
    }),
    [nodeErrors, settings.triggerType, settings.matchMode, settings.keywords, accountHandle, platform, pipelines, agents, connectedHandles, onAddAfter],
  );

  const save = React.useCallback(async (): Promise<AutomationDetail | null> => {
    setSaving(true);
    try {
      const result = await apiFetch<UpdateAutomationResult>(`/api/automations/${automation.id}`, {
        method: "PATCH",
        json: { ...settings, flow },
      });
      dispatch({ type: "saved", detail: result.automation });
      if (result.warnings.length > 0) {
        toast.warning("Saved and paused", { description: result.warnings[0], duration: 8000 });
      } else {
        toast.success("Saved");
      }
      router.refresh();
      return result.automation;
    } catch (err) {
      const message = err instanceof ApiClientError && err.errors.length > 0 ? err.errors[0] : errorMessage(err, "Couldn't save");
      toast.error("Couldn't save", { description: message });
      return null;
    } finally {
      setSaving(false);
    }
  }, [automation.id, settings, flow, router]);

  const setStatus = React.useCallback(
    async (next: "ACTIVE" | "PAUSED") => {
      setToggling(true);
      try {
        if (next === "ACTIVE" && dirty) {
          const saved = await save();
          if (!saved) return;
        }
        const { automation: updated } = await apiFetch<{ automation: AutomationDetail }>(`/api/automations/${automation.id}/status`, {
          method: "POST",
          json: { status: next },
        });
        dispatch({ type: "setStatus", status: updated.status });
        toast.success(next === "ACTIVE" ? "Automation is live" : "Automation paused");
        router.refresh();
      } catch (err) {
        const list = err instanceof ApiClientError ? err.errors : [];
        toast.error(next === "ACTIVE" ? "Can't go live yet" : "Couldn't pause", {
          description: list.length > 0 ? `${list[0]}${list.length > 1 ? ` (+${list.length - 1} more)` : ""}` : errorMessage(err),
          duration: 8000,
        });
      } finally {
        setToggling(false);
      }
    },
    [automation.id, dirty, save, router],
  );

  async function duplicate() {
    try {
      const { automation: copy } = await apiFetch<{ automation: AutomationDetail }>(`/api/automations/${automation.id}/duplicate`, { method: "POST" });
      toast.success(`Duplicated as “${copy.name}”`);
      router.push(`/automations/${copy.id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't duplicate"));
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/automations/${automation.id}`, { method: "DELETE" });
      toast.success("Automation deleted");
      router.push("/automations");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete"));
      throw err;
    }
  }

  // ⌘S saves; ⌘Z and ⇧⌘Z undo and redo canvas edits. Text fields keep their own undo.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        if (dirty && !saving) void save();
        return;
      }
      if (isTyping(e.target)) return;
      if (key === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, save]);

  React.useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Chrome still requires returnValue to be set to show the prompt.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const contactText = settings.matchMode === "ANY" ? "Love this 🔥" : (settings.keywords[0] ?? null);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-background md:h-dvh">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to automations"
              onClick={() => {
                if (dirty) setLeaveOpen(true);
                else router.push("/automations");
              }}
            >
              <ArrowLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to automations</TooltipContent>
        </Tooltip>

        <span aria-hidden className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple text-white sm:flex">
          <Workflow className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <input
            value={settings.name}
            onChange={(e) => dispatch({ type: "settings", patch: { name: e.target.value } })}
            onBlur={(e) => {
              if (!e.target.value.trim()) dispatch({ type: "settings", patch: { name: automation.name } });
            }}
            maxLength={80}
            aria-label="Automation name"
            className="font-display h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-[20px] leading-none outline-none transition-colors hover:bg-fog focus-visible:bg-fog focus-visible:ring-2 focus-visible:ring-ring/30 sm:max-w-md"
          />
          <StatusBadge status={status} />
          {dirty ? (
            <span className="hidden items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-muted-foreground lg:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-orange" aria-hidden />
              Unsaved
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {blockers.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-orange-soft px-3 text-[13px] font-semibold text-orange-ink outline-none transition-colors hover:bg-orange-soft/70 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {blockers.length} to fix
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4">
                <p className="mb-2.5 text-[13px] font-semibold">Before it can go live</p>
                <ul className="space-y-2">
                  {blockers.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : null}

          <Button variant="outline" size="sm" onClick={() => setTestOpen(true)} className="hidden sm:inline-flex">
            <FlaskConical /> Test
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant={status === "ACTIVE" ? "default" : "outline"} onClick={() => void save()} loading={saving} disabled={!dirty}>
                Save
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Save <Kbd className="border-white/20 bg-white/10 text-white">⌘S</Kbd>
            </TooltipContent>
          </Tooltip>

          {status === "ACTIVE" ? (
            <Button variant="outline" size="sm" onClick={() => void setStatus("PAUSED")} loading={toggling}>
              <Pause /> Pause
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button variant="highlight" size="sm" onClick={() => void setStatus("ACTIVE")} loading={toggling} disabled={blockers.length > 0}>
                    <Play /> Go live
                  </Button>
                </span>
              </TooltipTrigger>
              {blockers.length > 0 ? <TooltipContent>Fix the issues first</TooltipContent> : null}
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setTestOpen(true)} className="sm:hidden">
                <FlaskConical /> Test
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/automations/${automation.id}/analytics`}>
                  <BarChart3 /> Analytics
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicate}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <p className="shrink-0 border-b bg-yellow-soft px-4 py-2 text-[12px] font-medium md:hidden">Editing works best on a larger screen.</p>

      {/* Body: settings · canvas · inspector */}
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <aside className={cn("scrollbar-thin w-[320px] shrink-0 overflow-y-auto border-r bg-background", canvasOnly && "hidden")}>
          <TriggerPanel settings={settings} channels={channels} mediaById={mediaById} dispatch={dispatch} />
        </aside>
        <div className="relative min-w-[420px] flex-1">
          <BuilderNodeContext.Provider value={nodeContext}>
            <ReactFlowProvider>
              <FlowCanvas
                nodes={nodes}
                edges={edges}
                pipelines={pipelines}
                platform={platform}
                dispatch={dispatch}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                canvasOnly={canvasOnly}
                onCanvasOnlyChange={setCanvasOnly}
              />
            </ReactFlowProvider>
          </BuilderNodeContext.Provider>
        </div>
        <aside className={cn("scrollbar-thin w-[340px] shrink-0 overflow-y-auto border-l bg-background", canvasOnly && "hidden")}>
          <Inspector
            node={selectedNode}
            errors={selectedNode ? (nodeErrors.get(selectedNode.id) ?? []) : []}
            dispatch={dispatch}
            accountHandle={accountHandle}
            accountAvatarUrl={channel?.avatarUrl ?? null}
            platform={platform}
            conversation={conversation}
            contactText={contactText}
            contactLabel={CONTACT_LABEL[settings.triggerType]}
            pipelines={pipelines}
            agents={agents}
          />
        </aside>
      </div>

      <TestDialog
        automationId={automation.id}
        open={testOpen}
        onOpenChange={setTestOpen}
        settings={settings}
        flow={flow}
        mediaById={mediaById}
        accountHandle={accountHandle}
        accountAvatarUrl={channel?.avatarUrl ?? null}
        platform={platform}
      />

      <ConfirmDialog
        trigger={null}
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Leave without saving?"
        description="Your changes will be lost."
        confirmLabel="Leave"
        destructive
        onConfirm={() => {
          router.push("/automations");
        }}
      />

      <ConfirmDialog
        trigger={null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${settings.name}”?`}
        description="Conversations it started will stop. Its history stays in Logs."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
