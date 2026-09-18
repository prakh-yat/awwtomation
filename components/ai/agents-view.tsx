"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Send, Sparkles, Trash2, UserRound, X } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { STARTER_GUARDRAILS, STARTER_PROMPT, type AgentButton } from "@/lib/ai/agent";
import { MAX_BUTTONS, MAX_BUTTON_TITLE_CHARS } from "@/lib/meta/messages";
import type { AgentView, ProviderView } from "@/lib/services/ai";
import { cn, formatNumber } from "@/lib/utils";

type Draft = {
  name: string;
  providerId: string | null;
  systemPrompt: string;
  knowledge: string;
  guardrails: string;
  fallbackReply: string;
  buttons: AgentButton[];
  temperature: number;
  maxTokens: number;
  historyLimit: number;
};

const AUTO_PROVIDER = "__default__";

function toDraft(agent: AgentView): Draft {
  return {
    name: agent.name,
    providerId: agent.providerId,
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
  return (Object.keys(a) as Array<keyof Draft>).every((key) =>
    key === "buttons" ? JSON.stringify(a.buttons) === JSON.stringify(b.buttons) : a[key] === b[key],
  );
}

/**
 * The link buttons the agent may attach.
 *
 * The workspace writes both the label and the destination; the model can only
 * name a label. That is what keeps an interactive reply from ever carrying a
 * link nobody approved.
 */
function ButtonsEditor({
  buttons,
  onChange,
  disabled,
}: {
  buttons: AgentButton[];
  onChange: (next: AgentButton[]) => void;
  disabled: boolean;
}) {
  function set(index: number, patch: Partial<AgentButton>) {
    onChange(buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  return (
    <div className="space-y-2">
      {buttons.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-[12px] text-muted-foreground">
          No buttons yet. Add one and the agent can turn a reply into a tappable card.
        </p>
      ) : null}

      {buttons.map((button, index) => (
        <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <Input
            value={button.title}
            onChange={(e) => set(index, { title: e.target.value })}
            placeholder="Shop the collection"
            maxLength={MAX_BUTTON_TITLE_CHARS}
            aria-label={`Button ${index + 1} label`}
            disabled={disabled}
          />
          <Input
            value={button.url}
            onChange={(e) => set(index, { url: e.target.value })}
            placeholder="https://example.com/shop"
            aria-label={`Button ${index + 1} link`}
            disabled={disabled}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-muted-foreground"
            onClick={() => onChange(buttons.filter((_, i) => i !== index))}
            aria-label={`Remove button ${index + 1}`}
            disabled={disabled}
          >
            <X />
          </Button>
        </div>
      ))}

      {buttons.length < MAX_BUTTONS && !disabled ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...buttons, { title: "", url: "" }])}>
          <Plus /> Add a button
        </Button>
      ) : null}
    </div>
  );
}

// ───────────────────────── Playground ─────────────────────────

type Turn = { role: "user" | "assistant"; content: string; buttons?: AgentButton[]; note?: "handoff" | "done" };

/**
 * The same call the automation makes, against the same key and prompt, so what
 * you read here is exactly what a contact would get. Nothing is sent to anyone.
 */
function Playground({ agentId, dirty }: { agentId: string; dirty: boolean }) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Switching agent starts a fresh conversation; a half-finished one would read
  // as the new agent's history.
  React.useEffect(() => {
    setTurns([]);
    setInput("");
  }, [agentId]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setPending(true);
    try {
      const result = await apiFetch<{ reply: string; buttons: AgentButton[]; handoff: boolean; done: boolean }>("/api/ai/playground", {
        method: "POST",
        json: { agentId, messages: next.map(({ role, content }) => ({ role, content })) },
      });
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          buttons: result.buttons,
          note: result.handoff ? "handoff" : result.done ? "done" : undefined,
        },
      ]);
    } catch (err) {
      toast.error(errorMessage(err, "The provider did not answer"));
      setTurns((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} /> Try it
        </p>
        {turns.length > 0 ? (
          <button
            type="button"
            onClick={() => setTurns([])}
            className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Start over
          </button>
        ) : null}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {dirty ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px]">
            You have unsaved changes. Save to test them.
          </p>
        ) : null}

        {turns.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            Write what a customer would send and see the reply your key produces.
          </p>
        ) : null}

        {turns.map((turn, i) => (
          <div key={i} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
            <div className="max-w-[85%]">
              <div
                className={cn(
                  "whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                  turn.role === "user" ? "bg-foreground text-background" : "bg-secondary text-foreground",
                )}
              >
                {turn.content}
              </div>
              {turn.buttons && turn.buttons.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {turn.buttons.map((button, b) => (
                    <span
                      key={b}
                      className="flex items-center justify-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-[12px] font-medium"
                    >
                      {button.title}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </span>
                  ))}
                </div>
              ) : null}
              {turn.note ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {turn.note === "handoff" ? "Would hand over to a human here" : "Would end the conversation here"}
                </p>
              ) : null}
            </div>
          </div>
        ))}

        {pending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-secondary px-3.5 py-2.5">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          // Explicit rather than relying on implicit form submission: this is a
          // chat box, and Enter has to send whatever the surrounding markup does.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="How much is delivery to Pokhara?"
          aria-label="Message to test with"
          disabled={pending}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || pending} aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  );
}

// ───────────────────────── Editor ─────────────────────────

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-[12px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AgentsView({
  agents,
  providers,
  canManage,
}: {
  agents: AgentView[];
  providers: ProviderView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(agents[0]?.id ?? null);
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0] ?? null;

  const saved = React.useMemo(() => (selected ? toDraft(selected) : null), [selected]);
  const [draft, setDraft] = React.useState<Draft | null>(saved);
  const [draftFor, setDraftFor] = React.useState(selected?.id ?? null);
  const [saving, setSaving] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Selecting another agent loads its saved values, without an effect.
  if (draftFor !== (selected?.id ?? null)) {
    setDraftFor(selected?.id ?? null);
    setDraft(saved);
  }

  const dirty = Boolean(draft && saved && !sameDraft(draft, saved));

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function create() {
    setCreating(true);
    try {
      const { agent } = await apiFetch<{ agent: AgentView }>("/api/ai/agents", {
        method: "POST",
        json: {
          name: agents.length === 0 ? "Front desk" : `Agent ${agents.length + 1}`,
          systemPrompt: STARTER_PROMPT,
          guardrails: STARTER_GUARDRAILS,
        },
      });
      setSelectedId(agent.id);
      toast.success(`Created "${agent.name}"`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the agent"));
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      await apiFetch(`/api/ai/agents/${selected.id}`, {
        method: "PATCH",
        json: {
          ...draft,
          providerId: draft.providerId,
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
  }

  async function remove(id: string) {
    await apiFetch(`/api/ai/agents/${id}`, { method: "DELETE" });
    setSelectedId(agents.find((a) => a.id !== id)?.id ?? null);
    toast.success("Agent deleted");
    router.refresh();
  }

  async function makeDefault(id: string) {
    await apiFetch(`/api/ai/agents/${id}`, { method: "PATCH", json: { isDefault: true } });
    router.refresh();
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-6 py-12 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold tracking-tight">No agents yet</h2>
        <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
          An agent is a prompt, a set of rules and a model. Write it in your own words and it answers comments and DMs the
          way you would. You keep the key, so the replies cost you what your provider charges and nothing more.
        </p>
        {canManage ? (
          <Button className="mt-5" onClick={() => void create()} loading={creating}>
            <Plus /> Create an agent
          </Button>
        ) : null}
        {providers.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted-foreground">
            You will need{" "}
            <Link href="/ai/providers" className="font-medium text-foreground underline underline-offset-2">
              a provider key
            </Link>{" "}
            before it can reply.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_360px]">
      <aside className="space-y-2">
        <ul className="space-y-1">
          {agents.map((agent) => (
            <li key={agent.id}>
              <button
                type="button"
                onClick={() => setSelectedId(agent.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  agent.id === selected?.id ? "bg-foreground font-semibold text-background" : "hover:bg-secondary",
                )}
              >
                <UserRound className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                {agent.isDefault ? (
                  <span className={cn("text-[10px] uppercase tracking-wide", agent.id === selected?.id ? "text-background/70" : "text-muted-foreground")}>
                    Default
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {canManage ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => void create()} loading={creating}>
            <Plus /> New agent
          </Button>
        ) : null}
      </aside>

      {selected && draft ? (
        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl border bg-card p-5 shadow-card">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="agent-name">
                <Input id="agent-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={60} disabled={!canManage} />
              </Field>

              <Field
                label="Provider"
                htmlFor="agent-provider"
                hint={
                  providers.length === 0 ? (
                    <>
                      No key yet.{" "}
                      <Link href="/ai/providers" className="font-medium text-foreground underline underline-offset-2">
                        Connect one
                      </Link>
                      .
                    </>
                  ) : (
                    "Which of your keys pays for this agent's replies."
                  )
                }
              >
                <Select
                  value={draft.providerId ?? AUTO_PROVIDER}
                  onValueChange={(value) => set("providerId", value === AUTO_PROVIDER ? null : value)}
                  disabled={!canManage}
                >
                  <SelectTrigger id="agent-provider">
                    <SelectValue placeholder="Workspace default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_PROVIDER}>Workspace default</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.label} · {provider.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="mt-4 space-y-4">
              <Field
                label="System prompt"
                htmlFor="agent-prompt"
                hint="Who it is and how it should sound. This is passed to the model word for word, ahead of everything else."
              >
                <Textarea
                  id="agent-prompt"
                  rows={8}
                  value={draft.systemPrompt}
                  onChange={(e) => set("systemPrompt", e.target.value)}
                  disabled={!canManage}
                  className="font-mono text-[13px]"
                />
              </Field>

              <Field
                label="What it knows"
                htmlFor="agent-knowledge"
                hint="Prices, hours, shipping, return policy, links. Pasted in as it is, so keep it short and factual."
              >
                <Textarea
                  id="agent-knowledge"
                  rows={6}
                  value={draft.knowledge}
                  onChange={(e) => set("knowledge", e.target.value)}
                  disabled={!canManage}
                  placeholder={"Delivery inside the valley is free over Rs 3,000.\nWe ship nationwide in 3 to 5 days.\nReturns within 7 days, unworn."}
                />
              </Field>

              <Field
                label="Rules it cannot break"
                htmlFor="agent-guardrails"
                hint="Added after your prompt, so nothing above can argue its way past them."
              >
                <Textarea
                  id="agent-guardrails"
                  rows={5}
                  value={draft.guardrails}
                  onChange={(e) => set("guardrails", e.target.value)}
                  disabled={!canManage}
                />
              </Field>

              <Field
                label="Buttons it can attach"
                htmlFor="agent-buttons"
                hint="The agent names one of these by its label and we supply the link, so a reply can be interactive without the model ever inventing a URL."
              >
                <div id="agent-buttons">
                  <ButtonsEditor buttons={draft.buttons} onChange={(buttons) => set("buttons", buttons)} disabled={!canManage} />
                </div>
              </Field>

              <Field
                label="If the model fails"
                htmlFor="agent-fallback"
                hint="Sent when the provider is down or the key is refused, so a contact is never left on silence."
              >
                <Input
                  id="agent-fallback"
                  value={draft.fallbackReply}
                  onChange={(e) => set("fallbackReply", e.target.value)}
                  disabled={!canManage}
                  placeholder="Thanks for your message. Someone from the team will get back to you shortly."
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={`Creativity: ${draft.temperature.toFixed(1)}`} htmlFor="agent-temp" hint="0 is repeatable, 1 is loose.">
                  <input
                    id="agent-temp"
                    type="range"
                    min={0}
                    max={1.2}
                    step={0.1}
                    value={draft.temperature}
                    onChange={(e) => set("temperature", Number(e.target.value))}
                    disabled={!canManage}
                    className="h-9 w-full accent-foreground"
                  />
                </Field>
                <Field label="Longest reply" htmlFor="agent-tokens" hint="In tokens. 400 is about 4 short paragraphs.">
                  <Input
                    id="agent-tokens"
                    type="number"
                    min={60}
                    max={4000}
                    value={draft.maxTokens}
                    onChange={(e) => set("maxTokens", Number(e.target.value) || 400)}
                    disabled={!canManage}
                  />
                </Field>
                <Field label="Messages of context" htmlFor="agent-history" hint="More context costs more tokens on your key.">
                  <Input
                    id="agent-history"
                    type="number"
                    min={2}
                    max={50}
                    value={draft.historyLimit}
                    onChange={(e) => set("historyLimit", Number(e.target.value) || 20)}
                    disabled={!canManage}
                  />
                </Field>
              </div>
            </div>

            {canManage ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
                <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
                  {dirty ? "Save changes" : "Saved"}
                </Button>
                {selected.isDefault ? (
                  <Badge variant="secondary">Default agent</Badge>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => void makeDefault(selected.id)}>
                    Make default
                  </Button>
                )}
                <ConfirmDialog
                  title={`Delete ${selected.name}?`}
                  description="Automations pointing at it will fall back to your default agent."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => remove(selected.id)}
                  trigger={
                    <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-muted-foreground" aria-label={`Delete ${selected.name}`}>
                      <Trash2 />
                    </Button>
                  }
                />
              </div>
            ) : null}
          </div>

          <dl className="grid grid-cols-3 gap-3 rounded-2xl border bg-card px-5 py-4 text-center shadow-card">
            <div>
              <dt className="text-[12px] text-muted-foreground">Replies sent</dt>
              <dd className="font-display text-[22px] leading-none">{formatNumber(selected.repliesSent)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted-foreground">Prompt tokens</dt>
              <dd className="font-display text-[22px] leading-none">{formatNumber(selected.promptTokens)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted-foreground">Reply tokens</dt>
              <dd className="font-display text-[22px] leading-none">{formatNumber(selected.completionTokens)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {selected ? (
        <div className="h-[560px] min-w-0 xl:sticky xl:top-6">
          <Playground agentId={selected.id} dirty={dirty} />
        </div>
      ) : null}
    </div>
  );
}
