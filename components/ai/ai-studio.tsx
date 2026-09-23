"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BotMessageSquare, Check, ChevronDown, MessagesSquare, MoreHorizontal, Plus, Star, Trash2, X } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { STARTER_GUARDRAILS, STARTER_PROMPT, type AgentButton } from "@/lib/ai/agent";
import { presetFor, type ProviderPresetId } from "@/lib/ai/presets";
import { MAX_BUTTONS, MAX_BUTTON_TITLE_CHARS } from "@/lib/meta/messages";
import type { AgentView, ProviderView } from "@/lib/services/ai";
import { cn, formatNumber } from "@/lib/utils";

import { ConnectProviderDialog } from "./connect-provider-dialog";
import { ModelPicker } from "./model-picker";
import { Playground } from "./playground";
import { ProviderDialogs, type ProviderTarget } from "./provider-dialogs";
import { ProviderPicker } from "./provider-picker";
import { useProviderModels } from "./use-models";

/** Token counts run into the millions; the tile only has room for 12.4K. */
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

type Draft = {
  name: string;
  providerId: string | null;
  model: string | null;
  systemPrompt: string;
  knowledge: string;
  guardrails: string;
  fallbackReply: string;
  buttons: AgentButton[];
  temperature: number;
  maxTokens: number;
  historyLimit: number;
};

function toDraft(agent: AgentView): Draft {
  return {
    name: agent.name,
    providerId: agent.providerId,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    knowledge: agent.knowledge ?? "",
    guardrails: agent.guardrails ?? "",
    fallbackReply: agent.fallbackReply ?? "",
    buttons: agent.buttons,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    historyLimit: agent.historyLimit,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (Object.keys(a) as Array<keyof Draft>).every((key) => (key === "buttons" ? JSON.stringify(a.buttons) === JSON.stringify(b.buttons) : a[key] === b[key]));
}

/** The provider an agent actually uses: its own, or the workspace default. */
function effectiveProvider(providerId: string | null, providers: ProviderView[]): ProviderView | null {
  return (providerId ? providers.find((p) => p.id === providerId) : null) ?? providers.find((p) => p.isDefault) ?? providers[0] ?? null;
}

/** A labelled block of the settings column. */
function Field({ label, aside, children, className }: { label: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2.5 border-t px-4 py-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="brand-label text-muted-foreground">{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One of the three writing areas; on a desktop they share the column's height. */
function PromptArea({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  grow,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  /** Share of the column's height, as a flex-grow class. */
  grow: string;
}) {
  return (
    <div className={cn("flex min-h-[11rem] flex-col border-t transition-colors first:border-t-0 focus-within:bg-fog/40 lg:min-h-0", grow)}>
      <label htmlFor={id} className="brand-label px-5 pt-4 text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck
        className="scrollbar-thin min-h-0 w-full flex-1 resize-none bg-transparent px-5 pb-4 pt-2 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

/**
 * The link buttons the agent may attach. The workspace writes both the label
 * and the destination; the model can only name a label, so a reply can never
 * carry a link nobody approved.
 */
function ButtonsEditor({ buttons, onChange, disabled }: { buttons: AgentButton[]; onChange: (next: AgentButton[]) => void; disabled: boolean }) {
  function set(index: number, patch: Partial<AgentButton>) {
    onChange(buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  return (
    <div className="space-y-2">
      {buttons.map((button, index) => (
        <div key={index} className="group relative space-y-1.5 rounded-xl border bg-background p-2">
          <Input
            value={button.title}
            onChange={(e) => set(index, { title: e.target.value })}
            placeholder="Shop the collection"
            maxLength={MAX_BUTTON_TITLE_CHARS}
            aria-label={`Button ${index + 1} label`}
            disabled={disabled}
            className="h-9 pr-9 font-semibold"
          />
          <Input
            value={button.url}
            onChange={(e) => set(index, { url: e.target.value })}
            placeholder="https://yourshop.com/collection"
            inputMode="url"
            aria-label={`Button ${index + 1} link`}
            disabled={disabled}
            className="h-9 text-[13px]"
          />
          {disabled ? null : (
            <button
              type="button"
              onClick={() => onChange(buttons.filter((_, i) => i !== index))}
              aria-label={`Remove button ${index + 1}`}
              className="absolute right-3.5 top-3.5 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-fog hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {buttons.length < MAX_BUTTONS && !disabled ? (
        <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => onChange([...buttons, { title: "", url: "" }])}>
          <Plus /> Add button
        </Button>
      ) : null}
    </div>
  );
}

function AgentEditor({
  agent,
  providers,
  canManage,
  onDirtyChange,
  onDeleted,
}: {
  agent: AgentView;
  providers: ProviderView[];
  canManage: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const saved = React.useMemo(() => toDraft(agent), [agent]);
  const [draft, setDraft] = React.useState<Draft>(saved);
  const [saving, setSaving] = React.useState(false);
  const [advanced, setAdvanced] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [connect, setConnect] = React.useState<{ open: boolean; preset: ProviderPresetId | null }>({ open: false, preset: null });
  const [manage, setManage] = React.useState<ProviderTarget | null>(null);

  // A save refreshes the agent from the server; start again from what it now holds.
  React.useEffect(() => setDraft(saved), [saved]);

  const dirty = !sameDraft(draft, saved);
  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const provider = effectiveProvider(draft.providerId, providers);
  const preset = provider ? presetFor(provider) : null;
  const models = useProviderModels(provider?.id ?? null, canManage && Boolean(preset?.listsModels));
  const readOnly = !canManage;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const save = React.useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/ai/agents/${agent.id}`, {
        method: "PATCH",
        json: {
          ...draft,
          name: draft.name.trim() || agent.name,
          model: draft.model?.trim() || null,
          knowledge: draft.knowledge.trim() || null,
          guardrails: draft.guardrails.trim() || null,
          fallbackReply: draft.fallbackReply.trim() || null,
          buttons: draft.buttons.filter((b) => b.title.trim() && b.url.trim()),
        },
      });
      toast.success("Saved");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save"));
    } finally {
      setSaving(false);
    }
  }, [agent.id, agent.name, draft, router]);

  // Cmd or Ctrl + S saves, as it does in every editor.
  React.useEffect(() => {
    if (!canManage || !dirty) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canManage, dirty, saving, save]);

  async function makeDefault() {
    try {
      await apiFetch(`/api/ai/agents/${agent.id}`, { method: "PATCH", json: { isDefault: true } });
      toast.success(`${agent.name} is the default agent`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not change the default"));
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/ai/agents/${agent.id}`, { method: "DELETE" });
      toast.success(`${agent.name} deleted`);
      onDeleted(agent.id);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete the agent"));
      throw err;
    }
  }

  const stats = [
    { label: "Replies", value: agent.repliesSent },
    { label: "Tokens in", value: agent.promptTokens },
    { label: "Tokens out", value: agent.completionTokens },
  ];

  return (
    <>
      <aside className="scrollbar-thin min-h-0 overflow-y-auto rounded-3xl border bg-card lg:h-full">
        <div className="px-4 pb-4 pt-4">
          <div className="flex items-center gap-1.5">
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={60}
              disabled={readOnly}
              aria-label="Agent name"
              className="font-display min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-[22px] leading-none outline-none transition-colors hover:bg-fog focus-visible:bg-fog focus-visible:ring-2 focus-visible:ring-ring/30 disabled:hover:bg-transparent"
            />
            {agent.isDefault ? <Badge variant="yellow">Default</Badge> : null}
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`More for ${agent.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {agent.isDefault ? null : (
                    <>
                      <DropdownMenuItem onSelect={() => void makeDefault()}>
                        <Star /> Make default
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-1.5">
            {stats.map((s) => (
              // Number above its label; column-reverse keeps <dt> first in the markup.
              <div key={s.label} className="flex min-w-0 flex-col-reverse rounded-xl bg-fog px-2.5 py-2" title={`${formatNumber(s.value)} ${s.label.toLowerCase()}`}>
                <dt className="mt-1 truncate text-[11px] font-medium text-muted-foreground">{s.label}</dt>
                <dd className="font-display truncate text-[18px] leading-none tabular-nums">{compact.format(s.value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Field label="Model">
          <ProviderPicker
            id="agent-provider"
            providers={providers}
            value={provider}
            onChange={(next) => setDraft((prev) => (prev.providerId === next.id ? prev : { ...prev, providerId: next.id, model: null }))}
            canManage={canManage}
            onConnect={(presetId) => setConnect({ open: true, preset: presetId })}
            onManage={setManage}
          />
          {provider ? (
            <ModelPicker
              id="agent-model"
              value={draft.model}
              onChange={(model) => set("model", model)}
              models={models.models}
              suggestions={preset?.models ?? []}
              loading={models.loading}
              error={models.error}
              onReload={preset?.listsModels ? models.reload : undefined}
              defaultLabel={`Default (${provider.model})`}
              disabled={readOnly}
            />
          ) : null}
        </Field>

        <Field label="Link buttons" aside={<span className="text-[12px] tabular-nums text-muted-foreground">{draft.buttons.length}/{MAX_BUTTONS}</span>}>
          <ButtonsEditor buttons={draft.buttons} onChange={(buttons) => set("buttons", buttons)} disabled={readOnly} />
        </Field>

        <Field label="If the model fails">
          <Textarea
            aria-label="Reply when the model fails"
            rows={3}
            value={draft.fallbackReply}
            onChange={(e) => set("fallbackReply", e.target.value)}
            disabled={readOnly}
            placeholder="Thanks for your message. Someone from the team will get back to you shortly."
            className="min-h-0 resize-none text-[13px]"
          />
        </Field>

        <section className="border-t">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left outline-none transition-colors hover:bg-fog/60 focus-visible:bg-fog"
          >
            <span className="brand-label text-muted-foreground">Advanced</span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", advanced && "rotate-180")} />
          </button>
          {advanced ? (
            <div className="animate-fade-in space-y-4 px-4 pb-5">
              <div className="space-y-1">
                <Label htmlFor="agent-temp" className="flex items-center justify-between">
                  Creativity <span className="tabular-nums text-muted-foreground">{draft.temperature.toFixed(1)}</span>
                </Label>
                <input
                  id="agent-temp"
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(e) => set("temperature", Number(e.target.value))}
                  disabled={readOnly}
                  className="h-8 w-full accent-purple"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-tokens">Reply length</Label>
                  <Input id="agent-tokens" type="number" min={60} max={4000} value={draft.maxTokens} onChange={(e) => set("maxTokens", Number(e.target.value) || 400)} disabled={readOnly} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agent-history">Context</Label>
                  <Input id="agent-history" type="number" min={2} max={50} value={draft.historyLimit} onChange={(e) => set("historyLimit", Number(e.target.value) || 20)} disabled={readOnly} />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </aside>

      <section aria-label="Prompt" className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border bg-card lg:h-full">
        <PromptArea
          id="agent-prompt"
          label="Instructions"
          value={draft.systemPrompt}
          onChange={(v) => set("systemPrompt", v)}
          placeholder="Who it is, how it sounds, what it should do."
          disabled={readOnly}
          grow="lg:flex-[5]"
        />
        <PromptArea
          id="agent-knowledge"
          label="Knowledge"
          value={draft.knowledge}
          onChange={(v) => set("knowledge", v)}
          placeholder={"Delivery inside the valley is free over Rs 3,000.\nWe ship nationwide in 3 to 5 days.\nReturns within 7 days, unworn."}
          disabled={readOnly}
          grow="lg:flex-[4]"
        />
        <PromptArea
          id="agent-rules"
          label="Rules"
          value={draft.guardrails}
          onChange={(v) => set("guardrails", v)}
          placeholder="Never quote a price that is not listed above."
          disabled={readOnly}
          grow="lg:flex-[2]"
        />

        {canManage && dirty ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:absolute lg:bottom-0 lg:z-10 lg:p-4">
            <div className="pointer-events-auto flex animate-fade-in items-center gap-2 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-white shadow-pop">
              <span className="pr-1 text-[13px] font-medium">Unsaved changes</span>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setDraft(saved)} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" variant="highlight" onClick={() => void save()} loading={saving}>
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        trigger={null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${agent.name}?`}
        description="Automations using it switch to your default agent."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />

      <ConnectProviderDialog
        open={connect.open}
        onOpenChange={(open) => setConnect((prev) => ({ ...prev, open }))}
        initialPreset={connect.preset}
        onConnected={(connected) => {
          // Connected from this agent's picker, so this agent uses it.
          setDraft((prev) => ({ ...prev, providerId: connected.id, model: null }));
          router.refresh();
        }}
      />
      <ProviderDialogs target={manage} onClose={() => setManage(null)} />
    </>
  );
}

/** Switches between agents from the header; a new agent starts from the starter prompt. */
function AgentSwitcher({
  agents,
  providers,
  selected,
  onSelect,
  onCreate,
  creating,
  canManage,
}: {
  agents: AgentView[];
  providers: ProviderView[];
  selected: AgentView;
  onSelect: (id: string) => void;
  onCreate: () => void;
  creating: boolean;
  canManage: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 min-w-0 max-w-[16rem] items-center gap-2 rounded-full border bg-card pl-1.5 pr-3 text-left outline-none transition-colors hover:border-ink/30 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-ink"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <BotMessageSquare className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{selected.name}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <p className="brand-label px-2.5 pb-1 pt-2 text-muted-foreground">Agents</p>
        {agents.map((agent) => {
          const provider = effectiveProvider(agent.providerId, providers);
          const active = agent.id === selected.id;
          return (
            <DropdownMenuItem key={agent.id} onSelect={() => onSelect(agent.id)} className="items-start gap-2.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{agent.name}</span>
                  {agent.isDefault ? <Star className="h-3 w-3 shrink-0 fill-ink text-ink" aria-label="Default" /> : null}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{agent.model ?? provider?.model ?? "No model"}</span>
              </span>
              {active ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple" strokeWidth={2.5} /> : null}
            </DropdownMenuItem>
          );
        })}
        {canManage ? (
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

/**
 * The AI page: one agent at a time, fitted to the window. Settings on the
 * left, the words it works from in the middle, and a chat to try it on the
 * right (or on demand, where the window is too narrow for three columns).
 */
export function AiStudio({ agents, providers, canManage }: { agents: AgentView[]; providers: ProviderView[]; canManage: boolean }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(agents[0]?.id ?? null);
  const [creating, setCreating] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  // Leaving an agent with unsaved changes asks first; this is where it was headed.
  const [leaving, setLeaving] = React.useState<{ to: string } | { create: true } | null>(null);

  const selected = agents.find((a) => a.id === selectedId) ?? agents[0] ?? null;

  const create = React.useCallback(async () => {
    setCreating(true);
    try {
      const { agent } = await apiFetch<{ agent: AgentView }>("/api/ai/agents", {
        method: "POST",
        json: { name: agents.length === 0 ? "Front desk" : `Agent ${agents.length + 1}`, systemPrompt: STARTER_PROMPT, guardrails: STARTER_GUARDRAILS },
      });
      setSelectedId(agent.id);
      setDirty(false);
      toast.success(`Created ${agent.name}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the agent"));
    } finally {
      setCreating(false);
    }
  }, [agents.length, router]);

  function select(id: string) {
    if (id === selected?.id) return;
    if (dirty) setLeaving({ to: id });
    else setSelectedId(id);
  }

  function requestCreate() {
    if (dirty) setLeaving({ create: true });
    else void create();
  }

  if (!selected) {
    return (
      <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
        <PageHeader title="AI" className="mb-5" />
        <EmptyState
          tone="ink"
          icon={BotMessageSquare}
          title="No agents yet"
          description="An agent answers DMs in your words, with your model."
          className="lg:flex-1"
          action={
            canManage ? (
              <Button onClick={() => void create()} loading={creating}>
                <Plus /> Create agent
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)] lg:min-h-[34rem]">
      <PageHeader
        title="AI"
        className="mb-5"
        actions={
          <>
            <AgentSwitcher
              agents={agents}
              providers={providers}
              selected={selected}
              onSelect={select}
              onCreate={requestCreate}
              creating={creating}
              canManage={canManage}
            />
            <Button variant={chatOpen ? "default" : "outline"} className="xl:hidden" onClick={() => setChatOpen((v) => !v)} aria-pressed={chatOpen}>
              <MessagesSquare /> Test chat
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[18.5rem_minmax(0,1fr)_minmax(20rem,23rem)]">
        <AgentEditor
          key={selected.id}
          agent={selected}
          providers={providers}
          canManage={canManage}
          onDirtyChange={setDirty}
          onDeleted={(id) => {
            setDirty(false);
            setSelectedId(agents.find((a) => a.id !== id)?.id ?? null);
          }}
        />

        {/* One chat, two homes: a column where there is room for it, a panel
            over the page where there is not. It keeps its history either way. */}
        <div
          className={cn(
            "min-h-0",
            chatOpen
              ? "fixed inset-y-3 right-3 z-40 w-[min(23rem,calc(100vw-1.5rem))] animate-fade-in rounded-3xl shadow-pop xl:static xl:inset-auto xl:z-auto xl:w-auto xl:animate-none xl:shadow-none"
              : "hidden xl:block",
          )}
        >
          <Playground agentId={selected.id} dirty={dirty} onClose={chatOpen ? () => setChatOpen(false) : undefined} />
        </div>
      </div>

      <ConfirmDialog
        trigger={null}
        open={leaving !== null}
        onOpenChange={(open) => {
          if (!open) setLeaving(null);
        }}
        title={`Discard changes to ${selected.name}?`}
        description="They have not been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          const target = leaving;
          setLeaving(null);
          setDirty(false);
          if (target && "to" in target) setSelectedId(target.to);
          else if (target) void create();
        }}
      />
    </div>
  );
}
