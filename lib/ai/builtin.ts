/**
 * The built-in model: what an agent replies with when the workspace has not
 * connected a provider of its own (`AiAgent.providerId` is null).
 *
 * It is our key and our bill, so it is configured only on the server
 * (DEFAULT_AI_BASE_URL, DEFAULT_AI_API_KEY, DEFAULT_AI_MODEL; OpenRouter by
 * default) and kept on a short leash: one fixed model a workspace cannot
 * change, a cap on reply length, and the playground rate limited. Every reply
 * it writes is also a DM against the plan's monthly allowance, which bounds
 * the rest.
 *
 * Server only: never import this from a client component.
 */
import { brand } from "@/lib/brand";
import { optionalEnv } from "@/lib/env";

/** Replies are DMs of a few sentences; this leaves room without paying for essays. */
export const BUILT_IN_MAX_TOKENS = 500;

/** How the built-in option is named wherever a connection would be. */
export const BUILT_IN_LABEL = `${brand.name} AI`;

/**
 * What the UI may know: whether it works here and its name. Never the key,
 * and never the model behind it: people only ever see `BUILT_IN_LABEL`.
 */
export type BuiltInModel = {
  /** False when this server has no key for it: agents on it answer with their fallback reply. */
  available: boolean;
  label: string;
};

export type BuiltInTarget = {
  kind: "OPENAI_COMPATIBLE";
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Tried once when `model` is rate limited, down or silent; null tries `model` again. */
  fallbackModel: string | null;
};

const OPENROUTER = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

export function builtInModel(): BuiltInModel {
  return { available: Boolean(optionalEnv("DEFAULT_AI_API_KEY")), label: BUILT_IN_LABEL };
}

/** Everything a call needs, or null when the server has no key for it. */
export function builtInTarget(): BuiltInTarget | null {
  const apiKey = optionalEnv("DEFAULT_AI_API_KEY");
  if (!apiKey) return null;
  return {
    kind: "OPENAI_COMPATIBLE",
    apiKey,
    baseUrl: (optionalEnv("DEFAULT_AI_BASE_URL") || OPENROUTER).replace(/\/$/, ""),
    model: optionalEnv("DEFAULT_AI_MODEL") || DEFAULT_MODEL,
    fallbackModel: optionalEnv("DEFAULT_AI_FALLBACK_MODEL")?.trim() || null,
  };
}
