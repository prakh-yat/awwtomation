import type { AiProviderKind } from "@prisma/client";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type ChatRequest = {
  kind: AiProviderKind;
  /** Decrypted only inside the call. Never logged, never returned to the browser. */
  apiKey: string;
  /** Overrides the provider default; required for a self-hosted endpoint. */
  baseUrl?: string | null;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  /** Aborts the call so a hung provider cannot hold a job open. */
  timeoutMs?: number;
};

export type ChatUsage = { promptTokens: number; completionTokens: number };

export type ChatSuccess = {
  ok: true;
  text: string;
  usage: ChatUsage;
  /** The provider stopped at the token limit, so the last sentence may be unfinished. */
  truncated: boolean;
};

export type ChatFailureReason =
  /** The key was refused. The workspace has to fix it; retrying will not help. */
  | "invalid_key"
  /** The provider is rate limiting or briefly down. Worth another attempt. */
  | "rate_limited"
  | "unavailable"
  /** The request itself was rejected: unknown model, bad parameter, blocked content. */
  | "rejected"
  | "timeout"
  | "empty";

export type ChatFailure = {
  ok: false;
  reason: ChatFailureReason;
  /** Safe to show the workspace: the provider's own wording, never the key. */
  message: string;
  retryable: boolean;
};

export type ChatResult = ChatSuccess | ChatFailure;

export const PROVIDER_LABELS: Record<AiProviderKind, string> = {
  OPENAI_COMPATIBLE: "OpenAI compatible",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google Gemini",
};

/**
 * What each provider's endpoint looks like by default, and a few models people
 * actually use. Suggestions only: the model is a free-text field, because a
 * list we maintain would be out of date the week after it ships.
 */
export const PROVIDER_INFO: Record<
  AiProviderKind,
  { defaultBaseUrl: string; keyLabel: string; keyHelp: string; models: readonly string[]; baseUrlHelp: string }
> = {
  OPENAI_COMPATIBLE: {
    defaultBaseUrl: "https://api.openai.com/v1",
    keyLabel: "API key",
    keyHelp: "From platform.openai.com, console.groq.com, openrouter.ai or whichever service you use.",
    models: ["gpt-4o-mini", "gpt-4.1-mini", "llama-3.3-70b-versatile", "deepseek-chat", "mistral-small-latest"],
    baseUrlHelp: "Any service that serves /chat/completions. Change this for Groq, OpenRouter, Together or your own server.",
  },
  ANTHROPIC: {
    defaultBaseUrl: "https://api.anthropic.com",
    keyLabel: "API key",
    keyHelp: "From console.anthropic.com.",
    models: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
    baseUrlHelp: "Leave as it is unless you route Anthropic through your own proxy.",
  },
  GOOGLE: {
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    keyLabel: "API key",
    keyHelp: "From aistudio.google.com.",
    models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    baseUrlHelp: "Leave as it is unless you route Google through your own proxy.",
  },
};
