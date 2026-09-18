"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AiProviderKind } from "@prisma/client";
import { CheckCircle2, KeyRound, Plug, Trash2, TriangleAlert } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { PROVIDER_INFO, PROVIDER_LABELS } from "@/lib/ai/types";
import type { ProviderView } from "@/lib/services/ai";
import { cn } from "@/lib/utils";

const KINDS: AiProviderKind[] = ["OPENAI_COMPATIBLE", "ANTHROPIC", "GOOGLE"];

type Draft = { label: string; kind: AiProviderKind; apiKey: string; baseUrl: string; model: string };

function emptyDraft(kind: AiProviderKind = "OPENAI_COMPATIBLE"): Draft {
  return { label: PROVIDER_LABELS[kind], kind, apiKey: "", baseUrl: "", model: PROVIDER_INFO[kind].models[0] };
}

function StatusBadge({ provider }: { provider: ProviderView }) {
  if (provider.status === "INVALID_KEY") {
    return (
      <Badge variant="destructive">
        <TriangleAlert className="h-3 w-3" /> Key refused
      </Badge>
    );
  }
  if (provider.status === "ERROR") {
    return (
      <Badge variant="warning">
        <TriangleAlert className="h-3 w-3" /> Last call failed
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <CheckCircle2 className="h-3 w-3" /> Working
    </Badge>
  );
}

function ProviderForm({ draft, onChange }: { draft: Draft; onChange: (next: Draft) => void }) {
  const info = PROVIDER_INFO[draft.kind];
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="provider-kind">Provider</Label>
        <Select
          value={draft.kind}
          onValueChange={(value) => {
            const kind = value as AiProviderKind;
            onChange({ ...draft, kind, label: PROVIDER_LABELS[kind], model: PROVIDER_INFO[kind].models[0], baseUrl: "" });
          }}
        >
          <SelectTrigger id="provider-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {PROVIDER_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[12px] text-muted-foreground">{info.baseUrlHelp}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="provider-label">Name</Label>
        <Input id="provider-label" value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} maxLength={60} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="provider-key">{info.keyLabel}</Label>
        <Input
          id="provider-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft.apiKey}
          onChange={(e) => onChange({ ...draft, apiKey: e.target.value })}
          placeholder="sk-..."
        />
        <p className="text-[12px] text-muted-foreground">
          {info.keyHelp} It is encrypted before it is stored and never sent back to this page.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="provider-model">Model</Label>
        <Input
          id="provider-model"
          value={draft.model}
          onChange={(e) => onChange({ ...draft, model: e.target.value })}
          list="provider-model-options"
          placeholder={info.models[0]}
        />
        <datalist id="provider-model-options">
          {info.models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <p className="text-[12px] text-muted-foreground">Exactly as the provider spells it. Anything they serve will work.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="provider-base">Endpoint (optional)</Label>
        <Input
          id="provider-base"
          value={draft.baseUrl}
          onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })}
          placeholder={info.defaultBaseUrl}
        />
        <p className="text-[12px] text-muted-foreground">Leave empty for {info.defaultBaseUrl}.</p>
      </div>
    </div>
  );
}

export function ProvidersView({ providers, canManage }: { providers: ProviderView[]; canManage: boolean }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<ProviderView | null>(null);
  const [newKey, setNewKey] = React.useState("");

  async function create() {
    setSaving(true);
    try {
      await apiFetch("/api/ai/providers", {
        method: "POST",
        json: { ...draft, baseUrl: draft.baseUrl.trim() || undefined },
      });
      toast.success("Provider connected");
      setAddOpen(false);
      setDraft(emptyDraft());
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the provider"));
    } finally {
      setSaving(false);
    }
  }

  async function test(id: string) {
    setTesting(id);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>(`/api/ai/providers/${id}/test`, { method: "POST" });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not reach the provider"));
    } finally {
      setTesting(null);
    }
  }

  async function saveKey() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch(`/api/ai/providers/${editing.id}`, { method: "PATCH", json: { apiKey: newKey } });
      toast.success("Key replaced");
      setEditing(null);
      setNewKey("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not replace the key"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/api/ai/providers/${id}`, { method: "DELETE" });
    toast.success("Provider removed");
    router.refresh();
  }

  async function makeDefault(id: string) {
    await apiFetch(`/api/ai/providers/${id}`, { method: "PATCH", json: { isDefault: true } });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-sage/40 px-5 py-4">
        <h2 className="text-[15px] font-semibold">You bring the key, you keep the control</h2>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          Replies are generated with your own provider account, billed to you at their prices, with no markup and no
          per-message fee from us. Swap the model whenever you like, point it at your own server, or turn it off and the
          rest of the product carries on exactly as before.
        </p>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No provider connected"
          description="Add an API key from OpenAI, Anthropic, Google, Groq, OpenRouter or your own endpoint, and your agents can start replying."
          action={canManage ? <Button onClick={() => setAddOpen(true)}>Connect a provider</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {providers.map((provider) => (
            <div key={provider.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[15px] font-semibold">
                    <span className="truncate">{provider.label}</span>
                    {provider.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {PROVIDER_LABELS[provider.kind]} · {provider.model}
                  </p>
                </div>
                <StatusBadge provider={provider} />
              </div>

              <dl className="mt-4 space-y-1.5 text-[13px]">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">Key</dt>
                  <dd className="font-mono">····{provider.keyHint}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">Endpoint</dt>
                  <dd className="min-w-0 truncate">{provider.baseUrl ?? PROVIDER_INFO[provider.kind].defaultBaseUrl}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">Agents</dt>
                  <dd>{provider.agentCount}</dd>
                </div>
              </dl>

              {provider.lastError ? (
                <p className={cn("mt-3 rounded-lg border px-3 py-2 text-[12px]", "border-destructive/25 bg-destructive/5 text-destructive")}>
                  {provider.lastError}
                </p>
              ) : null}

              {canManage ? (
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <Button size="sm" variant="outline" onClick={() => void test(provider.id)} loading={testing === provider.id}>
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(provider);
                      setNewKey("");
                    }}
                  >
                    <KeyRound /> Replace key
                  </Button>
                  {provider.isDefault ? null : (
                    <Button size="sm" variant="ghost" onClick={() => void makeDefault(provider.id)}>
                      Make default
                    </Button>
                  )}
                  <ConfirmDialog
                    title={`Remove ${provider.label}?`}
                    description="Agents using it will fall back to the default provider. Your key is deleted from our database."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={() => remove(provider.id)}
                    trigger={
                      <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-muted-foreground" aria-label={`Remove ${provider.label}`}>
                        <Trash2 />
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManage && providers.length > 0 ? (
        <Button variant="outline" onClick={() => setAddOpen(true)}>
          Connect another provider
        </Button>
      ) : null}

      <Dialog open={addOpen} onOpenChange={(open) => !saving && setAddOpen(open)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a provider</DialogTitle>
            <DialogDescription>Your key, your account, your bill. We never charge for the model call.</DialogDescription>
          </DialogHeader>
          <ProviderForm draft={draft} onChange={setDraft} />
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void create()} loading={saving} disabled={!draft.apiKey.trim() || !draft.model.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !saving && !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Replace the key</DialogTitle>
            <DialogDescription>The old one is overwritten. Nothing else about {editing?.label} changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="replace-key">New API key</Label>
            <Input id="replace-key" type="password" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          </div>
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveKey()} loading={saving} disabled={newKey.trim().length < 8}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
