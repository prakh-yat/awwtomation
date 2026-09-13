"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { AlertTriangle, ArrowLeft, BarChart3, Copy, FlaskConical, MoreHorizontal, Pause, Play, Save, Trash2 } from "lucide-react";

import { apiFetch, ApiClientError, errorMessage } from "@/components/automations/api";
import { AutomationStatusBadge } from "@/components/automations/badges";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeFlowErrors, normalizeHandle, validateFlow } from "@/lib/automation/flow-types";
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
};

function handleFor(channel: ChannelOption | undefined): string {
  if (!channel) return "@yourbrand";
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? "@yourbrand";
}

const CONTACT_LABEL: Record<AutomationDetail["triggerType"], string> = { COMMENT: "Their comment", DM: "Their message", STORY_REPLY: "Their story reply" };

export function AutomationBuilder({ automation, channels, pipelines }: AutomationBuilderProps) {
  const router = useRouter();
  const [state, dispatch] = React.useReducer(builderReducer, automation, initBuilderState);
  const [saving, setSaving] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  // Hides the settings and inspector panels so the canvas gets the whole width.
  const [canvasOnly, setCanvasOnly] = React.useState(false);

  const { settings, nodes, edges, selectedNodeId, status, mediaById } = state;
  const channel = channels.find((c) => c.id === settings.channelId);
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
    else if (channel.status !== "ACTIVE") out.push("This account needs to be reconnected on the Channels page first.");
    out.push(...describeFlowErrors(flowErrors, flow));
    if (settings.matchMode !== "ANY" && settings.keywords.length === 0) out.push("Add at least one keyword, or switch matching to “Any”.");
    return out;
  }, [channel, flowErrors, flow, settings.matchMode, settings.keywords.length]);

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
      pipelines,
      connectedHandles,
      onAddAfter,
    }),
    [nodeErrors, settings.triggerType, settings.matchMode, settings.keywords, accountHandle, pipelines, connectedHandles, onAddAfter],
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
        toast.warning("Saved, but paused", { description: result.warnings[0], duration: 8000 });
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
        toast.error(next === "ACTIVE" ? "Can't activate yet" : "Couldn't pause", {
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

  // ⌘S / Ctrl+S saves; the browser's "save page" dialog is never what the user wants here.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) void save();
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

  const contactText = settings.matchMode === "ANY" ? "Love this! 🔥" : (settings.keywords[0] ?? null);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-background md:h-dvh">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
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

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            value={settings.name}
            onChange={(e) => dispatch({ type: "settings", patch: { name: e.target.value } })}
            onBlur={(e) => {
              if (!e.target.value.trim()) dispatch({ type: "settings", patch: { name: automation.name } });
            }}
            maxLength={80}
            aria-label="Automation name"
            className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm font-medium outline-none ring-offset-background transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring sm:max-w-md"
          />
          <AutomationStatusBadge status={status} />
          {dirty ? (
            <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
              Unsaved changes
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {blockers.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-warning hover:text-warning">
                  <AlertTriangle /> {blockers.length} {blockers.length === 1 ? "issue" : "issues"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <p className="mb-2 text-[12px] font-medium">Fix before activating</p>
                <ul className="space-y-1.5">
                  {blockers.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : null}

          <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
            <FlaskConical /> Test
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={() => save()} loading={saving} disabled={!dirty} className="relative">
                <Save /> Save
                {dirty ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-warning" aria-hidden /> : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Save <Kbd className="bg-white/10 text-white">⌘S</Kbd>
            </TooltipContent>
          </Tooltip>

          {status === "ACTIVE" ? (
            <Button variant="outline" size="sm" onClick={() => setStatus("PAUSED")} loading={toggling}>
              <Pause /> Pause
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button variant="outline" size="sm" onClick={() => setStatus("ACTIVE")} loading={toggling} disabled={blockers.length > 0}>
                    <Play /> Activate
                  </Button>
                </span>
              </TooltipTrigger>
              {blockers.length > 0 ? <TooltipContent>Resolve the issues first</TooltipContent> : null}
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
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

      <p className="shrink-0 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground md:hidden">
        The canvas needs a wider screen. Scroll sideways to reach it, or open this automation on a computer.
      </p>

      {/* Body: settings · canvas · inspector */}
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <aside className={cn("w-[340px] shrink-0 overflow-y-auto border-r bg-background scrollbar-thin", canvasOnly && "hidden")}>
          <TriggerPanel settings={settings} channels={channels} mediaById={mediaById} dispatch={dispatch} />
        </aside>
        <div className={cn("relative min-w-[420px] flex-1")}>
          <BuilderNodeContext.Provider value={nodeContext}>
            <ReactFlowProvider>
              <FlowCanvas nodes={nodes} edges={edges} pipelines={pipelines} dispatch={dispatch} canvasOnly={canvasOnly} onCanvasOnlyChange={setCanvasOnly} />
            </ReactFlowProvider>
          </BuilderNodeContext.Provider>
        </div>
        <aside className={cn("w-[320px] shrink-0 overflow-y-auto border-l bg-background scrollbar-thin", canvasOnly && "hidden")}>
          <Inspector
            node={selectedNode}
            errors={selectedNode ? (nodeErrors.get(selectedNode.id) ?? []) : []}
            dispatch={dispatch}
            accountHandle={accountHandle}
            accountAvatarUrl={channel?.avatarUrl ?? null}
            conversation={conversation}
            contactText={contactText}
            contactLabel={CONTACT_LABEL[settings.triggerType]}
            pipelines={pipelines}
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
      />

      <ConfirmDialog
        trigger={null}
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Discard unsaved changes?"
        description="You have edits that haven't been saved. Leave anyway?"
        confirmLabel="Discard and leave"
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
        description="Active conversations started by this automation will stop. Delivery history is kept in Logs."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
