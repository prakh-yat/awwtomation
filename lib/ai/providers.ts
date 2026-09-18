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
 */
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

function prepare(request: ChatRequest): Prepared {
  const base = baseFor(request);

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
        max_tokens: request.maxTokens,
        temperature: request.temperature,
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
        generationConfig: { temperature: request.temperature, maxOutputTokens: request.maxTokens },
      },
    };
  }

  return {
    url: `${base}/chat/completions`,
    headers: { authorization: `Bearer ${request.apiKey}`, "content-type": "application/json" },
    body: {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    },
  };
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

/** One completion. Never throws: every outcome comes back as a ChatResult. */
export async function chat(request: ChatRequest): Promise<ChatResult> {
  if (request.baseUrl) {
    const check = checkBaseUrl(request.baseUrl);
    if (!check.ok) return fail("rejected", check.message);
  }

  const { url, headers, body } = prepare(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) return classify(response.status, errorMessageFrom(parsed, raw));

    const reply = readReply(request.kind, parsed);
    if (!reply.text) return fail("empty", "The model returned an empty reply.", true);

    return {
      ok: true,
      text: reply.text,
      usage: { promptTokens: reply.promptTokens, completionTokens: reply.completionTokens },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return fail("timeout", "The provider did not answer in time.", true);
    }
    return fail("unavailable", "Could not reach the provider.", true);
  } finally {
    clearTimeout(timer);
  }
}
