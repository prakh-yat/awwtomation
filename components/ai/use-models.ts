"use client";

import * as React from "react";
import type { AiProviderKind } from "@prisma/client";

import { apiFetch, errorMessage } from "@/components/automations/api";

type ModelState = { models: string[] | null; loading: boolean; error: string | null; reload: () => void };

/** Lists survive navigation between agents; a provider's models do not change minute to minute. */
const cache = new Map<string, string[]>();

/** The live model list for a saved connection. */
export function useProviderModels(providerId: string | null, enabled = true): ModelState {
  const [models, setModels] = React.useState<string[] | null>(providerId ? (cache.get(providerId) ?? null) : null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!providerId || !enabled) {
      setModels(null);
      setError(null);
      return;
    }
    const cached = cache.get(providerId);
    if (cached && nonce === 0) {
      setModels(cached);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<{ models: string[] }>(`/api/ai/providers/${providerId}/models`)
      .then((res) => {
        if (cancelled) return;
        cache.set(providerId, res.models);
        setModels(res.models);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setModels(null);
        setError(errorMessage(err, "Could not load the models."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, enabled, nonce]);

  const reload = React.useCallback(() => {
    if (providerId) cache.delete(providerId);
    setNonce((n) => n + 1);
  }, [providerId]);

  return { models, loading, error, reload };
}

/** The same for a key typed into the connect dialog: fetched once the key looks complete, never stored. */
export function usePreviewModels(input: { kind: AiProviderKind; apiKey: string; baseUrl: string; needsBaseUrl: boolean; enabled?: boolean }): ModelState {
  const [models, setModels] = React.useState<string[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const key = input.apiKey.trim();
  const base = input.baseUrl.trim();
  const ready = input.enabled !== false && key.length >= 8 && (!input.needsBaseUrl || /^https?:\/\/\S+$/i.test(base));

  React.useEffect(() => {
    setModels(null);
    setError(null);
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      apiFetch<{ models: string[] }>("/api/ai/models", {
        method: "POST",
        json: { kind: input.kind, apiKey: key, baseUrl: base || undefined },
        signal: controller.signal,
      })
        .then((res) => {
          if (!controller.signal.aborted) setModels(res.models);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(err, "Could not load the models."));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input.kind, key, base, ready, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  return { models, loading, error, reload };
}
