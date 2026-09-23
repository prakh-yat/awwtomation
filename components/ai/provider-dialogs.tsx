"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { presetFor } from "@/lib/ai/presets";
import type { ProviderView } from "@/lib/services/ai";

import { ModelPicker } from "./model-picker";
import { ProviderLogo } from "./provider-logo";
import { useProviderModels } from "./use-models";

export type ProviderAction = "model" | "key" | "remove";
export type ProviderTarget = { action: ProviderAction; provider: ProviderView };

/** Changes a connection's default model, with the live list from its own key. */
function DefaultModelDialog({ provider, onClose }: { provider: ProviderView | null; onClose: () => void }) {
  const router = useRouter();
  const [model, setModel] = React.useState<string | null>(provider?.model ?? null);
  const [saving, setSaving] = React.useState(false);
  const preset = provider ? presetFor(provider) : null;
  const live = useProviderModels(provider?.id ?? null, Boolean(provider && preset?.listsModels));

  React.useEffect(() => setModel(provider?.model ?? null), [provider]);

  async function save() {
    if (!provider || !model) return;
    setSaving(true);
    try {
      await apiFetch(`/api/ai/providers/${provider.id}`, { method: "PATCH", json: { model } });
      toast.success("Default model updated");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update the model"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !saving && !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {preset ? <ProviderLogo preset={preset} size={36} /> : null}
            <div className="min-w-0">
              <DialogTitle>Default model</DialogTitle>
              <DialogDescription className="truncate">{provider?.label}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ModelPicker
          value={model}
          onChange={setModel}
          models={live.models}
          suggestions={preset?.models ?? []}
          loading={live.loading}
          error={live.error}
          onReload={preset?.listsModels ? live.reload : undefined}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!model || model === provider?.model}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceKeyDialog({ provider, onClose }: { provider: ProviderView | null; onClose: () => void }) {
  const router = useRouter();
  const [key, setKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const preset = provider ? presetFor(provider) : null;

  // A key typed for one connection must never be sitting there when the next opens.
  React.useEffect(() => setKey(""), [provider]);

  async function save() {
    if (!provider) return;
    setSaving(true);
    try {
      await apiFetch(`/api/ai/providers/${provider.id}`, { method: "PATCH", json: { apiKey: key.trim() } });
      toast.success("Key replaced");
      setKey("");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not replace the key"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !saving && !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim().length >= 8) void save();
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              {preset ? <ProviderLogo preset={preset} size={36} /> : null}
              <div className="min-w-0">
                <DialogTitle>Replace key</DialogTitle>
                <DialogDescription className="truncate">{provider?.label}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="replace-key">New API key</Label>
            <Input
              id="replace-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              placeholder={preset?.keyPlaceholder}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={key.trim().length < 8}>
              Replace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The dialogs behind a connection's menu. They live outside the provider
 * picker, so closing its popover to show one does not take the dialog with it.
 */
export function ProviderDialogs({ target, onClose }: { target: ProviderTarget | null; onClose: () => void }) {
  const router = useRouter();
  const provider = target?.provider ?? null;

  async function remove() {
    if (!provider) return;
    try {
      await apiFetch(`/api/ai/providers/${provider.id}`, { method: "DELETE" });
      toast.success(`${provider.label} removed`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the provider"));
      throw err;
    }
  }

  return (
    <>
      <DefaultModelDialog provider={target?.action === "model" ? provider : null} onClose={onClose} />
      <ReplaceKeyDialog provider={target?.action === "key" ? provider : null} onClose={onClose} />
      <ConfirmDialog
        trigger={null}
        open={target?.action === "remove"}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={`Remove ${provider?.label ?? "provider"}?`}
        description={provider && provider.agentCount > 0 ? "Its agents switch to your default provider. The key is deleted." : "The key is deleted."}
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      />
    </>
  );
}

/** Sends one short message through a saved connection and reports what came back. */
export async function testProvider(provider: ProviderView): Promise<void> {
  try {
    const result = await apiFetch<{ ok: boolean; message: string }>(`/api/ai/providers/${provider.id}/test`, { method: "POST" });
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  } catch (err) {
    toast.error(errorMessage(err, "Could not reach the provider"));
  }
}

export async function makeDefaultProvider(provider: ProviderView): Promise<boolean> {
  try {
    await apiFetch(`/api/ai/providers/${provider.id}`, { method: "PATCH", json: { isDefault: true } });
    toast.success(`${provider.label} is the default`);
    return true;
  } catch (err) {
    toast.error(errorMessage(err, "Could not change the default"));
    return false;
  }
}
