"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChannelPlatform } from "@prisma/client";
import { BotMessageSquare, Check, ChevronRight, ChevronsUpDown, Minus, Plus, Star } from "lucide-react";

import { ConnectProviderDialog } from "@/components/ai/connect-provider-dialog";
import { BuiltInLogo, ProviderLogo } from "@/components/ai/provider-logo";
import { apiFetch, errorMessage } from "@/components/automations/api";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { STARTER_GUARDRAILS, STARTER_PROMPT } from "@/lib/ai/agent";
import { presetById } from "@/lib/ai/presets";
import { DEFAULT_AI_TURNS, MAX_AI_TURNS, type FlowNodeData, type FlowNodeType } from "@/lib/automation/flow-types";
import type { AgentOption, AgentView } from "@/lib/services/ai";
import { cn } from "@/lib/utils";

import type { AddableNodeType } from "./builder-state";
import { AI_EXIT_INFO } from "./nodes";
import { AddStepMenu, StepIcon } from "./step-catalog";

type AiData = Extract<FlowNodeData, { type: "ai_reply" }>;

/** The step an exit leads to, named as the canvas names it. */
export type StepTarget = { id: string; name: string; type: FlowNodeType };

/** Why the picked agent cannot reply, as the inspector says it next to the fix. */
const PROBLEM: Record<NonNullable<AgentOption["problem"]>, string> = {
  no_provider: "The AI connection it used has been removed.",
  invalid_key: "Its AI provider refused the key.",
  error: "Its last reply failed.",
  builtin_unavailable: "The built-in AI is not set up on this server.",
};

/** Ready-made jobs for the step, so the first instruction is a click instead of a blank box. */
const STARTERS: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Answer questions", text: "Answer their questions from what you know. If you are not sure, say so and offer to get someone from the team." },
  { label: "Take an order", text: "Help them order. Find out what they want, the size or variant and where it should go, then share the order link." },
  { label: "Book a time", text: "Help them book. Ask what it is for and when suits them, then share the booking link." },
  { label: "Get their email", text: "Before you finish, ask for their email address so the team can follow up." },
  { label: "Recommend", text: "Ask what they are looking for, then suggest one or two products that fit and say why." },
];

function AgentMark({ agent, size = 32 }: { agent: AgentOption; size?: number }) {
  if (agent.builtIn) return <BuiltInLogo size={size} />;
  if (agent.presetId) return <ProviderLogo preset={presetById(agent.presetId)} size={size} />;
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center bg-ink text-white" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>
      <BotMessageSquare style={{ width: size * 0.5, height: size * 0.5 }} className="!text-white" strokeWidth={2.25} />
    </span>
  );
}

function AgentPicker({
  id,
  agents,
  value,
  onChange,
  onCreate,
  creating,
  canManageAi,
}: {
  id: string;
  agents: AgentOption[];
  value: AgentOption | null;
  onChange: (agentId: string) => void;
  onCreate: () => void;
  creating: boolean;
  canManageAi: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-input bg-background pl-2 pr-3 text-left outline-none transition-[border-color,box-shadow] hover:border-ink/30 focus-visible:border-ink focus-visible:ring-4 focus-visible:ring-ring/15 data-[state=open]:border-ink"
        >
          {value ? (
            <AgentMark agent={value} />
          ) : (
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-fog text-muted-foreground">
              <BotMessageSquare className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px] font-semibold", !value && "text-muted-foreground")}>{value?.name ?? "Pick an agent"}</span>
            {value ? (
              <span className={cn("block truncate text-[11px] text-muted-foreground", !value.builtIn && value.model && "font-mono")}>
                {value.model ?? "No provider yet"}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[16rem]">
        <DropdownMenuLabel>Agents</DropdownMenuLabel>
        {agents.map((agent) => (
          <DropdownMenuItem key={agent.id} onSelect={() => onChange(agent.id)} className="gap-2.5 py-1.5">
            <AgentMark agent={agent} size={26} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-ink">{agent.name}</span>
                {agent.isDefault ? <Star className="!size-3 fill-ink !text-ink" aria-label="Default" /> : null}
              </span>
              <span className={cn("block truncate text-[11px] text-muted-foreground", !agent.builtIn && agent.model && "font-mono")}>
                {agent.model ?? "No provider yet"}
              </span>
            </span>
            {agent.id === value?.id ? <Check className="!text-purple" strokeWidth={2.5} /> : null}
          </DropdownMenuItem>
        ))}
        {canManageAi ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreate} disabled={creating}>
              <Plus /> New agent
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Stepper({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (next: number) => void }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="inline-flex h-9 shrink-0 items-center rounded-full border bg-background p-0.5">
      <button
        type="button"
        aria-label="One reply fewer"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (n) onChange(clamp(n));
        }}
        className="w-8 bg-transparent text-center text-[14px] font-semibold tabular-nums outline-none"
      />
      <button
        type="button"
        aria-label="One reply more"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function ExitRow({
  label,
  tone,
  info,
  target,
  whenEmpty,
  platform,
  onAdd,
  onOpen,
}: {
  label: string;
  tone: "green" | "orange";
  info: string;
  target: StepTarget | null;
  whenEmpty: string;
  platform: ChannelPlatform | null;
  onAdd: (type: AddableNodeType) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2">
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", tone === "green" ? "bg-green" : "bg-orange")} />
      <div className="min-w-0 flex-1">
        <p className={cn("flex items-center gap-1 text-[12px] font-semibold", tone === "green" ? "text-green-ink" : "text-orange-ink")}>
          {label}
          <InfoTip label={`When it takes ${label}`}>{info}</InfoTip>
        </p>
        {target ? null : <p className="text-[11px] leading-snug text-muted-foreground">{whenEmpty}</p>}
      </div>
      {target ? (
        <button
          type="button"
          onClick={() => onOpen(target.id)}
          title={`Open ${target.name}`}
          className="inline-flex min-w-0 max-w-[10rem] items-center gap-1.5 rounded-full bg-fog py-1 pl-1 pr-2 text-[12px] font-semibold text-ink outline-none transition-colors hover:bg-ink hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StepIcon type={target.type} size={20} />
          <span className="truncate">{target.name}</span>
          <ChevronRight className="h-3 w-3 shrink-0" />
        </button>
      ) : (
        <AddStepMenu onPick={onAdd} align="end" label={`After ${label}`} platform={platform}>
          <Button size="sm" variant="secondary" className="h-7 shrink-0 px-2.5 text-[12px]">
            <Plus /> Add step
          </Button>
        </AddStepMenu>
      )}
    </div>
  );
}

export type AiStepEditorProps = {
  id: string;
  data: AiData;
  agents: AgentOption[];
  /** Admins and owners can create agents and connect providers. */
  canManageAi: boolean;
  platform: ChannelPlatform | null;
  update: (next: FlowNodeData) => void;
  exits: { next: StepTarget | null; handoff: StepTarget | null };
  onAddAfter: (handle: "next" | "handoff", type: AddableNodeType) => void;
  onOpenStep: (id: string) => void;
};

/**
 * Everything an AI step needs, top to bottom: who answers, what it should do
 * here, how many replies it gets, and where the conversation goes after.
 * Agents and providers can be set up from here without leaving the flow.
 */
export function AiStepEditor({ id, data, agents, canManageAi, platform, update, exits, onAddAfter, onOpenStep }: AiStepEditorProps) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [connectOpen, setConnectOpen] = React.useState(false);
  // An agent created from here lands after a request; by then the step may have been edited.
  const latest = React.useRef(data);
  React.useEffect(() => {
    latest.current = data;
  }, [data]);

  const agent = agents.find((a) => a.id === data.agentId) ?? null;
  const turns = data.maxTurns ?? DEFAULT_AI_TURNS;
  const instruction = data.instruction ?? "";

  async function createAgent() {
    setCreating(true);
    try {
      const { agent: created } = await apiFetch<{ agent: AgentView }>("/api/ai/agents", {
        method: "POST",
        json: { name: agents.length === 0 ? "Front desk" : `Agent ${agents.length + 1}`, systemPrompt: STARTER_PROMPT, guardrails: STARTER_GUARDRAILS },
      });
      update({ ...latest.current, agentId: created.id });
      toast.success(`Created ${created.name}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the agent"));
    } finally {
      setCreating(false);
    }
  }

  function addStarter(text: string) {
    const current = data.instruction?.trim() ?? "";
    update({ ...data, instruction: current ? `${current}\n${text}` : text });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between text-[12px]">
          <Label htmlFor={`${id}-agent`}>Agent</Label>
          {agent ? (
            <Link href={`/ai?agent=${agent.id}`} target="_blank" className="font-semibold text-purple-ink hover:underline">
              Edit agent
            </Link>
          ) : null}
        </div>
        {agents.length === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-fog px-3 py-2.5">
            <p className="text-[13px] font-semibold">No agents yet</p>
            {canManageAi ? (
              <Button size="sm" onClick={() => void createAgent()} loading={creating}>
                <Plus /> Create agent
              </Button>
            ) : (
              <Link href="/ai" target="_blank" className="text-[12px] font-semibold text-purple-ink hover:underline">
                Open AI
              </Link>
            )}
          </div>
        ) : (
          <AgentPicker
            id={`${id}-agent`}
            agents={agents}
            value={agent}
            onChange={(agentId) => update({ ...data, agentId })}
            onCreate={() => void createAgent()}
            creating={creating}
            canManageAi={canManageAi}
          />
        )}
        {agent?.problem ? (
          <div className="flex items-center gap-3 rounded-xl bg-yellow-soft px-3 py-2 text-[12px] leading-snug text-ink">
            <span className="min-w-0 flex-1">{PROBLEM[agent.problem]}</span>
            {agent.problem === "no_provider" && canManageAi ? (
              <Button size="sm" variant="default" className="h-7 shrink-0 px-2.5 text-[12px]" onClick={() => setConnectOpen(true)}>
                Connect provider
              </Button>
            ) : (
              <Link href={`/ai?agent=${agent.id}`} target="_blank" className="shrink-0 font-semibold underline underline-offset-2">
                Open AI
              </Link>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-[12px]">
          <Label htmlFor={`${id}-instruction`}>What it should do here</Label>
          <InfoTip label="About this instruction">
            Added to the agent&apos;s own instructions for this step only, so one agent can do a different job in each flow. Leave it empty to use the agent as it is.
          </InfoTip>
        </div>
        <Textarea
          id={`${id}-instruction`}
          rows={4}
          value={instruction}
          onChange={(e) => update({ ...data, instruction: e.target.value })}
          placeholder="Only talk about the autumn collection, and ask for their size."
          className="text-[13px]"
        />
        <div className="flex flex-wrap gap-1">
          {STARTERS.filter((s) => !instruction.includes(s.text)).map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => addStarter(s.text)}
              className="inline-flex items-center gap-1 rounded-full bg-fog px-2 py-0.5 text-[11px] font-semibold text-ink outline-none transition-colors hover:bg-ink hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-2.5 w-2.5" strokeWidth={3} />
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-[12px]">
          <Label htmlFor={`${id}-turns`}>Replies before moving on</Label>
          <InfoTip label="About replies before moving on">
            How many messages the AI can send in this step. It answers once each time they write. After its last reply the flow carries on through Done straight away. It moves on sooner if the conversation is finished or it needs a human.
          </InfoTip>
        </div>
        <div className="flex items-center gap-3">
          <Stepper id={`${id}-turns`} value={turns} min={1} max={MAX_AI_TURNS} onChange={(maxTurns) => update({ ...data, maxTurns })} />
          <span className="text-[12px] text-muted-foreground">{turns === 1 ? "One reply, then Done" : `Up to ${turns} replies, then Done`}</span>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[12px] font-medium leading-none">Where it goes next</p>
        <ExitRow
          label="Done"
          tone="green"
          info={AI_EXIT_INFO.next}
          target={exits.next}
          whenEmpty="Nothing here, so the flow ends."
          platform={platform}
          onAdd={(type) => onAddAfter("next", type)}
          onOpen={onOpenStep}
        />
        <ExitRow
          label="Needs a human"
          tone="orange"
          info={AI_EXIT_INFO.handoff}
          target={exits.handoff}
          whenEmpty={exits.next ? "Nothing here, so it takes Done." : "Nothing here, so the flow ends."}
          platform={platform}
          onAdd={(type) => onAddAfter("handoff", type)}
          onOpen={onOpenStep}
        />
      </section>

      {canManageAi ? (
        <ConnectProviderDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          onConnected={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
