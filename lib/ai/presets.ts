/**
 * The providers people pick from when they connect a key.
 *
 * Nearly every hosted model service speaks one of the three request shapes in
 * `providers.ts`, so a preset is just a name, a shape and an endpoint. Nothing
 * extra is stored: which preset a saved connection came from is read back off
 * its endpoint, so presets can be added or renamed without a migration.
 *
 * Logos live in /public/providers. They come from @lobehub/icons-static-svg
 * 1.95.1 (MIT); each mark is the trademark of its owner and is only used to
 * name that provider.
 *
 * Client-safe: no server imports.
 */
import type { AiProviderKind } from "@prisma/client";

export type ProviderPresetId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "xai"
  | "mistral"
  | "deepseek"
  | "groq"
  | "perplexity"
  | "together"
  | "fireworks"
  | "cerebras"
  | "huggingface"
  | "qwen"
  | "moonshot"
  | "zai"
  | "minimax"
  | "cohere"
  | "nvidia"
  | "sambanova"
  | "deepinfra"
  | "hyperbolic"
  | "novita"
  | "nebius"
  | "custom";

export type ProviderPreset = {
  id: ProviderPresetId;
  name: string;
  kind: AiProviderKind;
  /** Null means the request shape's own default endpoint. Required for `custom`. */
  baseUrl: string | null;
  /** Other hosts the same service answers on (a regional endpoint), so a saved connection is still recognised. */
  hosts?: readonly string[];
  /** Where the key is created, for the "Get a key" link. */
  keyUrl: string | null;
  keyPlaceholder: string;
  /**
   * A few models to start from. Once a key is entered the list comes live from
   * the provider and these only order it, so they need to be sensible, not complete.
   */
  models: readonly string[];
  /** False for a service with no model list: the picker offers the suggestions and free text. */
  listsModels: boolean;
  /** Path of the logo under /public, or null for a custom endpoint. */
  logo: string | null;
};

const logo = (id: ProviderPresetId) => `/providers/${id}.svg`;

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: null,
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    models: ["gpt-6-luna", "gpt-6-sol", "gpt-5-mini"],
    listsModels: true,
    logo: logo("openai"),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "ANTHROPIC",
    baseUrl: null,
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    models: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5-5"],
    listsModels: true,
    logo: logo("anthropic"),
  },
  {
    id: "google",
    name: "Google Gemini",
    kind: "GOOGLE",
    baseUrl: null,
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    models: ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"],
    listsModels: true,
    logo: logo("google"),
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyPlaceholder: "sk-or-...",
    models: ["openai/gpt-6-luna", "anthropic/claude-haiku-4.5", "google/gemini-3.8-flash", "deepseek/deepseek-v4.1-flash", "meta-llama/llama-3.3-70b-instruct"],
    listsModels: true,
    logo: logo("openrouter"),
  },
  {
    id: "xai",
    name: "xAI",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.x.ai/v1",
    keyUrl: "https://console.x.ai",
    keyPlaceholder: "xai-...",
    models: ["grok-4.3", "grok-4.7"],
    listsModels: true,
    logo: logo("xai"),
  },
  {
    id: "mistral",
    name: "Mistral",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyPlaceholder: "Mistral API key",
    models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
    listsModels: true,
    logo: logo("mistral"),
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-...",
    models: ["deepseek-chat", "deepseek-reasoner"],
    listsModels: true,
    logo: logo("deepseek"),
  },
  {
    id: "groq",
    name: "Groq",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"],
    listsModels: true,
    logo: logo("groq"),
  },
  {
    id: "perplexity",
    name: "Perplexity",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.perplexity.ai",
    keyUrl: "https://www.perplexity.ai/settings/api",
    keyPlaceholder: "pplx-...",
    models: ["sonar", "sonar-pro"],
    listsModels: false,
    logo: logo("perplexity"),
  },
  {
    id: "together",
    name: "Together AI",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.together.xyz/v1",
    keyUrl: "https://api.together.ai/settings/api-keys",
    keyPlaceholder: "Together API key",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "openai/gpt-oss-120b", "deepseek-ai/DeepSeek-V3"],
    listsModels: true,
    logo: logo("together"),
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyUrl: "https://app.fireworks.ai/settings/users/api-keys",
    keyPlaceholder: "fw_...",
    models: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/gpt-oss-120b", "accounts/fireworks/models/deepseek-v3"],
    listsModels: true,
    logo: logo("fireworks"),
  },
  {
    id: "cerebras",
    name: "Cerebras",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.cerebras.ai/v1",
    keyUrl: "https://cloud.cerebras.ai",
    keyPlaceholder: "csk-...",
    models: ["gpt-oss-120b", "llama-3.3-70b", "llama3.1-8b"],
    listsModels: true,
    logo: logo("cerebras"),
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://router.huggingface.co/v1",
    keyUrl: "https://huggingface.co/settings/tokens",
    keyPlaceholder: "hf_...",
    models: ["openai/gpt-oss-120b", "meta-llama/Llama-3.3-70B-Instruct", "deepseek-ai/DeepSeek-V3.2"],
    listsModels: true,
    logo: logo("huggingface"),
  },
  {
    id: "qwen",
    name: "Qwen",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    hosts: ["dashscope.aliyuncs.com", "dashscope-us.aliyuncs.com"],
    keyUrl: "https://modelstudio.console.alibabacloud.com",
    keyPlaceholder: "sk-...",
    models: ["qwen-flash", "qwen-plus", "qwen-max"],
    listsModels: true,
    logo: logo("qwen"),
  },
  {
    id: "moonshot",
    name: "Moonshot AI",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.moonshot.ai/v1",
    hosts: ["api.moonshot.cn"],
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    keyPlaceholder: "sk-...",
    models: ["kimi-k2.6", "kimi-k3", "kimi-latest"],
    listsModels: true,
    logo: logo("moonshot"),
  },
  {
    id: "zai",
    name: "Z.ai",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.z.ai/api/paas/v4",
    hosts: ["open.bigmodel.cn"],
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    keyPlaceholder: "Z.ai API key",
    models: ["glm-5.3-flash", "glm-5.3"],
    listsModels: true,
    logo: logo("zai"),
  },
  {
    id: "minimax",
    name: "MiniMax",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.minimax.io/v1",
    hosts: ["api.minimaxi.com"],
    keyUrl: "https://platform.minimax.io",
    keyPlaceholder: "MiniMax API key",
    models: ["MiniMax-M3", "MiniMax-M2.7"],
    listsModels: true,
    logo: logo("minimax"),
  },
  {
    id: "cohere",
    name: "Cohere",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.cohere.ai/compatibility/v1",
    hosts: ["api.cohere.com"],
    keyUrl: "https://dashboard.cohere.com/api-keys",
    keyPlaceholder: "Cohere API key",
    models: ["command-a-03-2025", "command-r-08-2024", "command-r7b-12-2024"],
    listsModels: true,
    logo: logo("cohere"),
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyUrl: "https://build.nvidia.com",
    keyPlaceholder: "nvapi-...",
    models: ["openai/gpt-oss-20b", "moonshotai/kimi-k2.6", "deepseek-ai/deepseek-v4.1-flash"],
    listsModels: true,
    logo: logo("nvidia"),
  },
  {
    id: "sambanova",
    name: "SambaNova",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.sambanova.ai/v1",
    keyUrl: "https://cloud.sambanova.ai/apis",
    keyPlaceholder: "SambaNova API key",
    models: ["Meta-Llama-3.3-70B-Instruct", "gpt-oss-120b", "DeepSeek-V3.2"],
    listsModels: true,
    logo: logo("sambanova"),
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    keyUrl: "https://deepinfra.com/dash/api_keys",
    keyPlaceholder: "DeepInfra API key",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "openai/gpt-oss-120b", "deepseek-ai/DeepSeek-V3.2"],
    listsModels: true,
    logo: logo("deepinfra"),
  },
  {
    id: "hyperbolic",
    name: "Hyperbolic",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.hyperbolic.xyz/v1",
    keyUrl: "https://app.hyperbolic.xyz/settings",
    keyPlaceholder: "Hyperbolic API key",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "openai/gpt-oss-120b"],
    listsModels: true,
    logo: logo("hyperbolic"),
  },
  {
    id: "novita",
    name: "Novita AI",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.novita.ai/openai",
    keyUrl: "https://novita.ai/settings/key-management",
    keyPlaceholder: "sk_...",
    models: ["meta-llama/llama-3.3-70b-instruct", "openai/gpt-oss-120b", "deepseek/deepseek-v3.2"],
    listsModels: true,
    logo: logo("novita"),
  },
  {
    id: "nebius",
    name: "Nebius",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.tokenfactory.nebius.com/v1",
    hosts: ["api.studio.nebius.com", "api.studio.nebius.ai"],
    keyUrl: "https://tokenfactory.nebius.com",
    keyPlaceholder: "Nebius API key",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "openai/gpt-oss-120b"],
    listsModels: true,
    logo: logo("nebius"),
  },
  {
    id: "custom",
    name: "Custom endpoint",
    kind: "OPENAI_COMPATIBLE",
    baseUrl: null,
    keyUrl: null,
    keyPlaceholder: "API key",
    models: [],
    listsModels: true,
    logo: null,
  },
];

export function presetById(id: ProviderPresetId): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Which preset a saved connection came from: the request shape, then the
 * endpoint's host. An OpenAI-compatible connection on an unknown host is a
 * custom endpoint.
 */
export function presetFor(connection: { kind: AiProviderKind; baseUrl: string | null }): ProviderPreset {
  const host = hostOf(connection.baseUrl);
  if (connection.kind === "ANTHROPIC") return presetById("anthropic");
  if (connection.kind === "GOOGLE") return presetById("google");
  if (!host || host === "api.openai.com") return presetById("openai");
  const match = PROVIDER_PRESETS.find((p) => p.kind === "OPENAI_COMPATIBLE" && (hostOf(p.baseUrl) === host || p.hosts?.includes(host)));
  return match ?? presetById("custom");
}
