"use client";

import * as React from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { PROVIDER_PRESETS, presetById, type ProviderPresetId } from "@/lib/ai/presets";
import type { ProviderView } from "@/lib/services/ai";
import { cn } from "@/lib/utils";

import { ModelPicker } from "./model-picker";
import { ProviderLogo } from "./provider-logo";
import { usePreviewModels } from "./use-models";

/** The grid of providers to choose from, shared by the dialog and the empty page. */
export function ProviderGrid({ onPick, compact = false }: { onPick: (id: ProviderPresetId) => void; compact?: boolean }) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
      {PROVIDER_PRESETS.map((preset, i) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPick(preset.id)}
          className="rise lift flex items-center gap-3 rounded-2xl border bg-card p-3 text-left outline-none hover:border-ink/40 focus-visible:ring-2 focus-visible:ring-ring"
          style={{ "--i": i } as React.CSSProperties}
        >
          <ProviderLogo preset={preset} size={compact ? 30 : 34} />
          <span className="min-w-0 truncate text-[13px] font-semibold">{preset.name}</span>
        </button>
      ))}
    </div>
  );
}

type ConnectProviderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Skip straight to the key when the provider was picked outside the dialog. */
  initialPreset?: ProviderPresetId | null;
  onConnected: (provider: ProviderView) => void;
};

export function ConnectProviderDialog({ open, onOpenChange, initialPreset = null, onConnected }: ConnectProviderDialogProps) {
  const [presetId, setPresetId] = React.useState<ProviderPresetId | null>(initialPreset);
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [model, setModel] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Every open starts clean; a key typed last time must not linger in memory or on screen.
  React.useEffect(() => {
    if (!open) return;
    setPresetId(initialPreset);
    setApiKey("");
    setBaseUrl("");
    setLabel("");
    setModel(initialPreset ? (presetById(initialPreset).models[0] ?? null) : null);
  }, [open, initialPreset]);

  const preset = presetId ? presetById(presetId) : null;
  const isCustom = preset?.id === "custom";
  const preview = usePreviewModels({
    kind: preset?.kind ?? "OPENAI_COMPATIBLE",
    apiKey: preset ? apiKey : "",
    baseUrl: isCustom ? baseUrl : (preset?.baseUrl ?? ""),
    needsBaseUrl: isCustom,
    enabled: preset?.listsModels ?? false,
  });

  // Once the live list arrives, keep the chosen model if the key can use it,
  // else the first suggestion it can. Failing both, nothing is picked: a guess
  // from a long list is worse than asking.
  React.useEffect(() => {
    if (!preview.models || !preset) return;
    setModel((current) => {
      if (current && preview.models?.includes(current)) return current;
      return preset.models.find((m) => preview.models?.includes(m)) ?? null;
    });
  }, [preview.models, preset]);

  function pick(id: ProviderPresetId) {
    setPresetId(id);
    setModel(presetById(id).models[0] ?? null);
  }

  const canSave = Boolean(preset && apiKey.trim().length >= 8 && model?.trim() && (!isCustom || /^https?:\/\/\S+$/i.test(baseUrl.trim())));

  async function connect() {
    if (!preset || !model) return;
    setSaving(true);
    try {
      const { provider } = await apiFetch<{ provider: ProviderView }>("/api/ai/providers", {
        method: "POST",
        json: {
          label: label.trim() || preset.name,
          kind: preset.kind,
          apiKey: apiKey.trim(),
          baseUrl: isCustom ? baseUrl.trim() : (preset.baseUrl ?? undefined),
          model: model.trim(),
        },
      });
      // Prove it works before anyone relies on it.
      const test = await apiFetch<{ ok: boolean; message: string }>(`/api/ai/providers/${provider.id}/test`, { method: "POST" }).catch(() => null);
      if (test?.ok) toast.success(`${preset.name} connected`, { description: test.message });
      else toast.warning(`${preset.name} saved, but the test reply failed`, { description: test?.message });
      setApiKey("");
      onConnected(provider);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not connect the provider"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {!preset ? (
          <>
            <DialogHeader>
              <DialogTitle>Connect a provider</DialogTitle>
              <DialogDescription>Pick where your models come from.</DialogDescription>
            </DialogHeader>
            <ProviderGrid onPick={pick} compact />
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <ProviderLogo preset={preset} size={40} />
                <div className="min-w-0">
                  <DialogTitle>{preset.name}</DialogTitle>
                  {initialPreset ? null : (
                    <button
                      type="button"
                      onClick={() => setPresetId(null)}
                      className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-ink"
                    >
                      <ArrowLeft className="h-3 w-3" /> Other providers
                    </button>
                  )}
                </div>
              </div>
              <DialogDescription className="sr-only">Add an API key for {preset.name}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isCustom ? (
                <div className="space-y-1.5">
                  <Label htmlFor="provider-base">Endpoint</Label>
                  <Input
                    id="provider-base"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://your-server.example.com/v1"
                    inputMode="url"
                    autoComplete="off"
                  />
                  <p className="text-[12px] text-muted-foreground">Any service that serves /chat/completions.</p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="provider-key">API key</Label>
                  {preset.keyUrl ? (
                    <a
                      href={preset.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-purple-ink hover:underline"
                    >
                      Get a key <ArrowUpRight className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <Input
                  id="provider-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={preset.keyPlaceholder}
                  className="font-mono"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="provider-model">Default model</Label>
                <ModelPicker
                  id="provider-model"
                  value={model}
                  onChange={setModel}
                  models={preview.models}
                  suggestions={preset.models}
                  loading={preview.loading}
                  error={preview.error}
                  onReload={preset.listsModels ? preview.reload : undefined}
                />
                {preview.error && apiKey.trim().length >= 8 ? <p className="text-[12px] text-muted-foreground">{preview.error}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="provider-label">Name</Label>
                <Input id="provider-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={preset.name} maxLength={60} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void connect()} loading={saving} disabled={!canSave}>
                Connect
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
