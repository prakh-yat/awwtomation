/**
 * The bring-your-own-key model call.
 *
 * Three request shapes cover nearly every provider anyone wants to use:
 * anything that speaks OpenAI's /chat/completions (OpenAI, Groq, OpenRouter,
 * DeepSeek, Together, Mistral, a vLLM box of your own), Anthropic's Messages
 * API, and Google's Generative Language API. The workspace supplies the key,
 * the endpoint and the model, so the cost and the choice are both theirs.
 *
 * Nothing here logs or returns the key. Failures are classified rather than
 * thrown, because the caller has to decide between "tell them to fix the key",
 * "try again in a minute" and "send the fallback reply".
 *
 * Model families disagree about parameters. Newer reasoning models refuse a
 * `temperature`, OpenAI's want `max_completion_tokens`, and thinking models
 * spend part of the token budget before they write a word. `tuningFor` starts
 * from what each family is known to accept, and a 400 that names a parameter
 * gets one corrected retry, so a model released next month still works.
 */
import { lookup } from "node:dns/promises";

import { brand } from "@/lib/brand";

import { PROVIDER_INFO, type ChatFailure, type ChatRequest, type ChatResult } from "./types";

const DEFAULT_TIMEOUT_MS = 25_000;

/** This machine. Allowed in development so Ollama and LM Studio can be used. */
function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Addresses a workspace must never be able to point the server at.
 *
 * The cloud metadata endpoint is the one that matters: 169.254.169.254 hands
 * out instance credentials to anything on the box that asks, so it is blocked
 * in development too, unlike loopback.
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "0.0.0.0" || host === "metadata.google.internal") return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10) return true;
    if (a === 169 && b === 254) return true; // link-local, including cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  }
  // IPv6 unique-local and link-local.
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) return true;
  return false;
}

/**
 * Validates a custom endpoint before we make a server-side request to it.
 *
 * A base URL is user input that we then fetch from our own network, so it is
 * exactly the shape of a server-side request forgery. Public https only, and
 * never a private address. In development a plain localhost endpoint is allowed
 * so Ollama and LM Studio can be tested.
 */
export function checkBaseUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, message: "That is not a valid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "The endpoint has to be an http or https URL." };
  }
  // Blocked everywhere, development included: these are the addresses that turn
  // a settings field into a way to read the server's own network.
  if (isBlockedHost(url.hostname)) return { ok: false, message: "That address is not allowed." };

  if (isLoopback(url.hostname)) {
    if (process.env.NODE_ENV === "development") return { ok: true, url: url.toString().replace(/\/$/, "") };
    return { ok: false, message: "That address is not reachable from the server." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "The endpoint has to be https." };
  return { ok: true, url: url.toString().replace(/\/$/, "") };
}

/**
 * The second half of the SSRF guard: what the hostname actually resolves to.
 *
 * `checkBaseUrl` only reads the hostname as written, so `https://not-suspicious.example`
 * with an A record of 169.254.169.254 would sail through it. Resolving first and
 * checking every address closes that, and is the check that matters, because the
 * name in the settings field is chosen by the same person who controls its DNS.
 *
 * A name that will not resolve is refused too: better a clear message here than a
 * confusing network failure a second later.
 */
async function resolvesToPublicAddress(hostname: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // An IP literal was already judged by `checkBaseUrl`; there is nothing to resolve.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return { ok: true };

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, message: "That hostname could not be resolved." };
  }
  if (addresses.length === 0) return { ok: false, message: "That hostname could not be resolved." };

  const allowLoopback = process.env.NODE_ENV === "development";
  for (const { address } of addresses) {
    if (isBlockedHost(address)) return { ok: false, message: "That address is not allowed." };
    if (isLoopback(address) && !allowLoopback) return { ok: false, message: "That address is not reachable from the server." };
  }
  return { ok: true };
}

function fail(reason: ChatFailure["reason"], message: string, retryable = false): ChatFailure {
  return { ok: false, reason, message, retryable };
}

/** Maps an HTTP status onto what the caller should do about it. */
function classify(status: number, message: string): ChatFailure {
  if (status === 401 || status === 403) return fail("invalid_key", message || "The provider refused this API key.");
  if (status === 429) return fail("rate_limited", message || "The provider is rate limiting this key.", true);
  if (status >= 500) return fail("unavailable", message || "The provider is unavailable right now.", true);
  return fail("rejected", message || `The provider rejected the request (${status}).`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Digs the human-readable part out of whatever error envelope a provider uses. */
function errorMessageFrom(body: unknown, rawText: string): string {
  if (isRecord(body)) {
    const error = body.error;
    if (typeof error === "string") return error;
    if (isRecord(error) && typeof error.message === "string") return error.message;
    if (typeof body.message === "string") return body.message;
  }
  return rawText.slice(0, 300);
}

function baseFor(request: ChatRequest): string {
  const configured = request.baseUrl?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return PROVIDER_INFO[request.kind].defaultBaseUrl;
}

type Prepared = { url: string; headers: Record<string, string>; body: unknown };

/** What a request sends besides the conversation; adjusted when a provider refuses a parameter. */
type Tuning = {
  temperature: boolean;
  tokenParam: "max_tokens" | "max_completion_tokens";
  /** Ask a reasoning model to think briefly: a DM reply needs little of it. */
  lowEffort: boolean;
  /** Gemini Flash can skip thinking altogether. */
  noThinking: boolean;
  /** Extra tokens for models that think before they answer. */
  headroom: number;
  /**
   * OpenRouter's own reasoning switch: think briefly and leave the thinking out
   * of the reply. Models that do not reason ignore it.
   */
  openRouterReasoning: boolean;
};

const THINKING_HEADROOM = 2048;
/** OpenRouter routes to reasoning models too; low effort needs far less than a full budget. */
const OPENROUTER_HEADROOM = 1024;

function isOpenRouter(base: string): boolean {
  const host = hostOf(base);
  return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
}

function hostOf(base: string): string {
  try {
    return new URL(base).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Claude models from the 4.7 generation on take no sampling parameters and do their own thinking. */
function isNewClaude(model: string): boolean {
  return /^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[78])/i.test(model);
}

/** OpenAI's reasoning families: no temperature, and a budget that includes the reasoning. */
function isOpenAiReasoning(model: string): boolean {
  const id = model.toLowerCase().replace(/^openai\//, "");
  return /^(o\d|gpt-[5-9])/.test(id) && !id.includes("chat");
}

function tuningFor(request: ChatRequest): Tuning {
  const base: Tuning = { temperature: true, tokenParam: "max_tokens", lowEffort: false, noThinking: false, headroom: 0, openRouterReasoning: false };

  if (request.kind === "ANTHROPIC") {
    return isNewClaude(request.model) ? { ...base, temperature: false, lowEffort: true, headroom: THINKING_HEADROOM } : base;
  }

  if (request.kind === "GOOGLE") {
    const model = request.model.toLowerCase();
    if (/gemini-2\.5-flash/.test(model)) return { ...base, noThinking: true };
    if (/gemini-(2\.5|[3-9])/.test(model)) return { ...base, headroom: THINKING_HEADROOM };
    return base;
  }

  if (isOpenRouter(baseFor(request))) return { ...base, openRouterReasoning: true, headroom: OPENROUTER_HEADROOM };

  const direct = hostOf(baseFor(request)) === "api.openai.com";
  const reasoning = direct && isOpenAiReasoning(request.model);
  return {
    ...base,
    tokenParam: direct ? "max_completion_tokens" : "max_tokens",
    temperature: !reasoning,
    lowEffort: reasoning,
    headroom: reasoning ? THINKING_HEADROOM : 0,
  };
}

/**
 * Reads a 400 for a parameter the model will not take, and returns the tuning
 * that leaves it out. Null when the refusal is about something else.
 */
function retune(tuning: Tuning, message: string): Tuning | null {
  const text = message.toLowerCase();
  const refused = /(unsupported|not supported|does not support|only the default|not allowed|unrecognized|unknown|extra inputs|not permitted|invalid|deprecated|cannot|removed|no longer)/.test(text);
  if (!refused) return null;
  if (tuning.temperature && text.includes("temperature")) return { ...tuning, temperature: false };
  if (tuning.tokenParam === "max_tokens" && text.includes("max_completion_tokens")) return { ...tuning, tokenParam: "max_completion_tokens" };
  if (tuning.tokenParam === "max_completion_tokens" && text.includes("max_completion_tokens")) return { ...tuning, tokenParam: "max_tokens" };
  if (tuning.lowEffort && /(effort|output_config|reasoning)/.test(text)) return { ...tuning, lowEffort: false };
  if (tuning.openRouterReasoning && /reasoning/.test(text)) return { ...tuning, openRouterReasoning: false };
  if (tuning.noThinking && /(thinking)/.test(text)) return { ...tuning, noThinking: false, headroom: THINKING_HEADROOM };
  return null;
}

function prepare(request: ChatRequest, tuning: Tuning): Prepared {
  const base = baseFor(request);
  const maxTokens = request.maxTokens + tuning.headroom;

  if (request.kind === "ANTHROPIC") {
    // Anthropic takes the system prompt as its own field, not as a message.
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    return {
      url: `${base}/v1/messages`,
      headers: {
        "x-api-key": request.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: {
        model: request.model,
        max_tokens: maxTokens,
        // Anthropic's range is 0 to 1; an agent tuned for another provider may be set higher.
        ...(tuning.temperature ? { temperature: Math.min(Math.max(request.temperature, 0), 1) } : {}),
        ...(tuning.lowEffort ? { output_config: { effort: "low" } } : {}),
        ...(system ? { system } : {}),
        messages: request.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      },
    };
  }

  if (request.kind === "GOOGLE") {
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    return {
      // The key goes in a header rather than the query string, so it stays out
      // of any proxy or access log along the way.
      url: `${base}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
      headers: { "x-goog-api-key": request.apiKey, "content-type": "application/json" },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: request.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: {
          ...(tuning.temperature ? { temperature: request.temperature } : {}),
          maxOutputTokens: maxTokens,
          ...(tuning.noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      },
    };
  }

  return {
    url: `${base}/chat/completions`,
    headers: {
      authorization: `Bearer ${request.apiKey}`,
      "content-type": "application/json",
      // OpenRouter's attribution headers; every other endpoint ignores them.
      ...(isOpenRouter(base) ? { "HTTP-Referer": appOrigin(), "X-Title": brand.name } : {}),
    },
    body: {
      model: request.model,
      messages: request.messages,
      ...(tuning.temperature ? { temperature: request.temperature } : {}),
      [tuning.tokenParam]: maxTokens,
      ...(tuning.lowEffort ? { reasoning_effort: "low" } : {}),
      ...(tuning.openRouterReasoning ? { reasoning: { effort: "low", exclude: true } } : {}),
    },
  };
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function readReply(kind: ChatRequest["kind"], body: unknown): { text: string; promptTokens: number; completionTokens: number } {
  if (!isRecord(body)) return { text: "", promptTokens: 0, completionTokens: 0 };

  if (kind === "ANTHROPIC") {
    const parts = Array.isArray(body.content) ? body.content : [];
    const text = parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    const usage = isRecord(body.usage) ? body.usage : {};
    return {
      text,
      promptTokens: Number(usage.input_tokens ?? 0) || 0,
      completionTokens: Number(usage.output_tokens ?? 0) || 0,
    };
  }

  if (kind === "GOOGLE") {
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    const first = isRecord(candidates[0]) ? candidates[0] : {};
    const content = isRecord(first.content) ? first.content : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    const usage = isRecord(body.usageMetadata) ? body.usageMetadata : {};
    return {
      text,
      promptTokens: Number(usage.promptTokenCount ?? 0) || 0,
      completionTokens: Number(usage.candidatesTokenCount ?? 0) || 0,
    };
  }

  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(first.message) ? first.message : {};
  const text = typeof message.content === "string" ? message.content.trim() : "";
  const usage = isRecord(body.usage) ? body.usage : {};
  return {
    text,
    promptTokens: Number(usage.prompt_tokens ?? 0) || 0,
    completionTokens: Number(usage.completion_tokens ?? 0) || 0,
  };
}

/** The SSRF guard for a configured endpoint: the URL as written, then what its name resolves to. */
async function guardEndpoint(baseUrl: string | null | undefined): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!baseUrl) return { ok: true };
  const check = checkBaseUrl(baseUrl);
  if (!check.ok) return check;
  return resolvesToPublicAddress(new URL(check.url).hostname);
}

type Exchange = { status: number; parsed: unknown; raw: string };

/** One HTTP round trip with the timeout and redirect rules every provider call shares. */
async function exchange(url: string, init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown }, timeoutMs: number): Promise<Exchange | ChatFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
      // Never follow a redirect. Every address check above is made against the
      // URL the workspace configured; a 302 would take us somewhere nobody
      // checked, which is exactly how an https endpoint reaches the metadata
      // service. No chat-completions API redirects, so refusing costs nothing.
      redirect: "manual",
    });

    // `redirect: "manual"` surfaces the 3xx itself (status 0 for an opaque one).
    if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
      return fail("rejected", "The endpoint redirected the request. Point it straight at the API instead.");
    }

    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, parsed, raw };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return fail("timeout", "The provider did not answer in time.", true);
    }
    return fail("unavailable", "Could not reach the provider.", true);
  } finally {
    clearTimeout(timer);
  }
}

function isFailure(value: Exchange | ChatFailure): value is ChatFailure {
  return "ok" in value && value.ok === false;
}

/** One completion. Never throws: every outcome comes back as a ChatResult. */
export async function chat(request: ChatRequest): Promise<ChatResult> {
  const guard = await guardEndpoint(request.baseUrl);
  if (!guard.ok) return fail("rejected", guard.message);

  let tuning = tuningFor(request);
  // The first attempt plus at most two corrections: enough to drop a refused
  // temperature and swap the token parameter, never a loop.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { url, headers, body } = prepare(request, tuning);
    const result = await exchange(url, { method: "POST", headers, body }, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (isFailure(result)) return result;

    if (result.status < 200 || result.status >= 300) {
      const message = errorMessageFrom(result.parsed, result.raw);
      const next = result.status === 400 ? retune(tuning, message) : null;
      if (next) {
        tuning = next;
        continue;
      }
      return classify(result.status, message);
    }

    const reply = readReply(request.kind, result.parsed);
    if (!reply.text) return fail("empty", "The model returned an empty reply.", true);

    return {
      ok: true,
      text: reply.text,
      usage: { promptTokens: reply.promptTokens, completionTokens: reply.completionTokens },
    };
  }
  return fail("rejected", "The provider kept refusing the request's parameters.");
}

// ───────────────────────── Model lists ─────────────────────────

export type ModelListResult = { ok: true; models: string[] } | { ok: false; message: string };

/** Ids that are plainly not chat models: embeddings, speech, images, moderation and the like. */
const NOT_CHAT = /(embed|embedding|whisper|tts|transcri|dall-e|gpt-image|imagen|image-gen|moderation|rerank|davinci|babbage|audio|realtime|search-preview|computer-use|guard|aqa|veo|lyria)/i;

function idsFrom(body: unknown): string[] {
  const list = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.data) ? body.data : isRecord(body) && Array.isArray(body.models) ? body.models : [];
  const ids: string[] = [];
  for (const item of list) {
    if (typeof item === "string") ids.push(item);
    else if (isRecord(item) && typeof item.id === "string") ids.push(item.id);
  }
  return ids;
}

/**
 * The models a key can use, straight from the provider, so the picker is never
 * out of date. Same endpoint guard and redirect rule as a completion.
 */
export async function listModels(input: { kind: ChatRequest["kind"]; apiKey: string; baseUrl?: string | null }): Promise<ModelListResult> {
  const guard = await guardEndpoint(input.baseUrl);
  if (!guard.ok) return guard;

  const base = input.baseUrl?.trim() ? input.baseUrl.trim().replace(/\/$/, "") : PROVIDER_INFO[input.kind].defaultBaseUrl;
  const request: { url: string; headers: Record<string, string> } =
    input.kind === "ANTHROPIC"
      ? { url: `${base}/v1/models?limit=100`, headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01" } }
      : input.kind === "GOOGLE"
        ? { url: `${base}/v1beta/models?pageSize=1000`, headers: { "x-goog-api-key": input.apiKey } }
        : { url: `${base}/models`, headers: { authorization: `Bearer ${input.apiKey}` } };

  const result = await exchange(request.url, { method: "GET", headers: request.headers }, 15_000);
  if (isFailure(result)) return { ok: false, message: result.message };
  if (result.status === 401 || result.status === 403) return { ok: false, message: "The provider refused this key." };
  if (result.status === 404) return { ok: false, message: "This endpoint does not list its models. Type the model name instead." };
  if (result.status < 200 || result.status >= 300) return { ok: false, message: errorMessageFrom(result.parsed, result.raw) || "Could not load the models." };

  let ids: string[];
  if (input.kind === "GOOGLE") {
    const models = isRecord(result.parsed) && Array.isArray(result.parsed.models) ? result.parsed.models : [];
    ids = models
      .filter((m) => isRecord(m) && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => (isRecord(m) && typeof m.name === "string" ? m.name.replace(/^models\//, "") : ""))
      .filter(Boolean);
  } else {
    ids = idsFrom(result.parsed);
  }

  const models = Array.from(new Set(ids.filter((id) => !NOT_CHAT.test(id)))).sort((a, b) => a.localeCompare(b));
  if (models.length === 0) return { ok: false, message: "No chat models came back for this key." };
  return { ok: true, models: models.slice(0, 600) };
}
