/**
 * Providers and agents.
 *
 * An agent replies with one of two things: the built-in model (our key,
 * lib/ai/builtin.ts), when its `providerId` is null, or a connection the
 * workspace made with its own API key. Either way the prompt is built the same
 * way, platform rules included (lib/ai/agent.ts).
 *
 * A workspace's API key is encrypted with APP_ENCRYPTION_KEY and only ever
 * decrypted inside this module, on the server. `toProviderView` is the only way
 * a provider leaves here, and it carries a four character hint instead of the
 * key, so there is no path from the database to the browser that includes it.
 */
import { AiProviderStatus, type AiAgent, type AiProvider, type AiProviderKind } from "@prisma/client";
import { z } from "zod";

import {
  agentButtonsSchema,
  buildMessages,
  fallbackReplyFor,
  hasOtherScript,
  LANGUAGE_CORRECTION,
  parseReply,
  readAgentButtons,
  STARTER_GUARDRAILS,
  STARTER_PROMPT,
  toOutboundMessage,
  type AgentButton,
  type AgentContext,
} from "@/lib/ai/agent";
import { BUILT_IN_LABEL, BUILT_IN_MAX_TOKENS, builtInModel, builtInTarget } from "@/lib/ai/builtin";
import { presetFor, type ProviderPresetId } from "@/lib/ai/presets";
import { chat, checkBaseUrl, listModels } from "@/lib/ai/providers";
import type { ChatMessage, ChatResult } from "@/lib/ai/types";
import { decrypt, encrypt } from "@/lib/crypto";
import { checkWorkspaceLimit } from "@/lib/billing/usage";
import { prisma } from "@/lib/db";
import type { OutboundMessage } from "@/lib/meta/types";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/security/rate-limit-ip";
import { ApiError } from "@/lib/workspace/api";

// ───────────────────────── Schemas ─────────────────────────

const providerKindSchema = z.enum(["OPENAI_COMPATIBLE", "ANTHROPIC", "GOOGLE"]);

export const providerCreateSchema = z.object({
  label: z.string().trim().min(1, "Give it a name").max(60),
  kind: providerKindSchema,
  apiKey: z.string().trim().min(8, "That key looks too short").max(500),
  baseUrl: z.string().trim().max(300).optional().or(z.literal("")),
  model: z.string().trim().min(1, "Pick a model").max(120),
});
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;

/** A key that has not been saved yet, to list its models while the connect dialog is open. */
export const modelPreviewSchema = z.object({
  kind: providerKindSchema,
  apiKey: z.string().trim().min(8, "That key looks too short").max(500),
  baseUrl: z.string().trim().max(300).optional().or(z.literal("")),
});
export type ModelPreviewInput = z.infer<typeof modelPreviewSchema>;

export const providerUpdateSchema = providerCreateSchema.partial().extend({
  /** Omitted when the key is not being changed; the stored one is kept. */
  apiKey: z.string().trim().min(8).max(500).optional(),
  isDefault: z.boolean().optional(),
});
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;

export const agentCreateSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  /** Null is the built-in model; left out, a new agent uses the workspace's default connection, or the built-in model when there is none. */
  providerId: z.string().max(64).nullable().optional(),
  /** Null or empty uses the provider's default model. */
  model: z.string().trim().max(120).nullable().optional(),
  systemPrompt: z.string().trim().min(1, "The prompt cannot be empty").max(20_000),
  knowledge: z.string().max(40_000).nullable().optional(),
  guardrails: z.string().max(10_000).nullable().optional(),
  fallbackReply: z.string().max(1000).nullable().optional(),
  buttons: agentButtonsSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(60).max(4000).optional(),
  historyLimit: z.number().int().min(2).max(50).optional(),
  isDefault: z.boolean().optional(),
});
export type AgentCreateInput = z.infer<typeof agentCreateSchema>;

export const agentUpdateSchema = agentCreateSchema.partial();
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;

export const playgroundSchema = z.object({
  agentId: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(40),
  /** A flow step's own instruction, to try the agent as that step. */
  instruction: z.string().max(4000).optional(),
});

// ───────────────────────── DTOs ─────────────────────────

/** A provider as the browser may see it: everything but the key. */
export type ProviderView = {
  id: string;
  label: string;
  kind: AiProviderKind;
  keyHint: string;
  baseUrl: string | null;
  model: string;
  status: AiProviderStatus;
  lastError: string | null;
  lastUsedAt: string | null;
  isDefault: boolean;
  agentCount: number;
};

export type AgentView = {
  id: string;
  name: string;
  /** Null: the agent replies with the built-in model. */
  providerId: string | null;
  /** Null when the agent uses its provider's default model. */
  model: string | null;
  systemPrompt: string;
  knowledge: string | null;
  guardrails: string | null;
  fallbackReply: string | null;
  buttons: AgentButton[];
  temperature: number;
  maxTokens: number;
  historyLimit: number;
  isDefault: boolean;
  repliesSent: number;
  promptTokens: number;
  completionTokens: number;
  updatedAt: string;
};

export function toProviderView(provider: AiProvider & { _count?: { agents: number } }): ProviderView {
  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    keyHint: provider.keyHint,
    baseUrl: provider.baseUrl,
    model: provider.model,
    status: provider.status,
    lastError: provider.lastError,
    lastUsedAt: provider.lastUsedAt?.toISOString() ?? null,
    isDefault: provider.isDefault,
    agentCount: provider._count?.agents ?? 0,
  };
}

export function toAgentView(agent: AiAgent): AgentView {
  return {
    id: agent.id,
    name: agent.name,
    providerId: agent.providerId,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    knowledge: agent.knowledge,
    guardrails: agent.guardrails,
    fallbackReply: agent.fallbackReply,
    buttons: readAgentButtons(agent.buttons),
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    historyLimit: agent.historyLimit,
    isDefault: agent.isDefault,
    repliesSent: agent.repliesSent,
    promptTokens: agent.promptTokens,
    completionTokens: agent.completionTokens,
    updatedAt: agent.updatedAt.toISOString(),
  };
}

// ───────────────────────── Providers ─────────────────────────

function keyHint(apiKey: string): string {
  return apiKey.slice(-4);
}

const UNREADABLE_KEY = "The saved key can no longer be read. Enter it again under AI.";

/**
 * The provider's key, or null when it cannot be decrypted: it was saved under
 * another APP_ENCRYPTION_KEY. That is a key to enter again, not a crash, so
 * callers treat it like a key the provider refused.
 */
function readKey(provider: AiProvider): string | null {
  try {
    return decrypt(provider.apiKeyEnc);
  } catch {
    logger.warn("ai.key_unreadable", { providerId: provider.id });
    return null;
  }
}

function normalizeBaseUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const check = checkBaseUrl(value);
  if (!check.ok) throw new ApiError(400, check.message, "AI_BAD_BASE_URL");
  return check.url;
}

export async function listProviders(workspaceId: string): Promise<ProviderView[]> {
  const rows = await prisma.aiProvider.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { agents: true } } },
  });
  return rows.map(toProviderView);
}

export async function createProvider(workspaceId: string, input: ProviderCreateInput): Promise<ProviderView> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const existing = await prisma.aiProvider.count({ where: { workspaceId } });
  if (existing >= 10) throw new ApiError(400, "That is as many providers as one workspace can hold.", "AI_PROVIDER_LIMIT");

  const created = await prisma.aiProvider.create({
    data: {
      workspaceId,
      label: input.label,
      kind: input.kind,
      apiKeyEnc: encrypt(input.apiKey),
      keyHint: keyHint(input.apiKey),
      baseUrl,
      model: input.model,
      isDefault: existing === 0,
    },
    include: { _count: { select: { agents: true } } },
  });
  logger.info("ai.provider_created", { workspaceId, providerId: created.id, kind: created.kind });
  return toProviderView(created);
}

async function requireProvider(workspaceId: string, id: string): Promise<AiProvider> {
  const provider = await prisma.aiProvider.findFirst({ where: { id, workspaceId } });
  if (!provider) throw new ApiError(404, "That provider is not in this workspace.", "AI_PROVIDER_NOT_FOUND");
  return provider;
}

export async function updateProvider(workspaceId: string, id: string, input: ProviderUpdateInput): Promise<ProviderView> {
  await requireProvider(workspaceId, id);
  const baseUrl = input.baseUrl === undefined ? undefined : normalizeBaseUrl(input.baseUrl);

  if (input.isDefault) {
    await prisma.aiProvider.updateMany({ where: { workspaceId }, data: { isDefault: false } });
  }

  const updated = await prisma.aiProvider.update({
    where: { id },
    data: {
      label: input.label,
      kind: input.kind,
      model: input.model,
      baseUrl,
      isDefault: input.isDefault,
      ...(input.apiKey
        ? // A new key clears the old verdict: it has not been tried yet.
          { apiKeyEnc: encrypt(input.apiKey), keyHint: keyHint(input.apiKey), status: AiProviderStatus.ACTIVE, lastError: null }
        : {}),
    },
    include: { _count: { select: { agents: true } } },
  });
  return toProviderView(updated);
}

export async function deleteProvider(workspaceId: string, id: string): Promise<void> {
  await requireProvider(workspaceId, id);
  await prisma.aiProvider.delete({ where: { id } });
  // Keep exactly one default so agents always have something to fall back to.
  const remaining = await prisma.aiProvider.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  if (remaining && !(await prisma.aiProvider.findFirst({ where: { workspaceId, isDefault: true } }))) {
    await prisma.aiProvider.update({ where: { id: remaining.id }, data: { isDefault: true } });
  }
  logger.info("ai.provider_deleted", { workspaceId, providerId: id });
}

/** Records what the provider said about itself, so the UI can show a live verdict. */
async function recordProviderResult(providerId: string, result: ChatResult): Promise<void> {
  if (result.ok) {
    await prisma.aiProvider.update({
      where: { id: providerId },
      data: { status: AiProviderStatus.ACTIVE, lastError: null, lastUsedAt: new Date() },
    });
    return;
  }
  await prisma.aiProvider.update({
    where: { id: providerId },
    data: {
      status: result.reason === "invalid_key" ? AiProviderStatus.INVALID_KEY : AiProviderStatus.ERROR,
      lastError: result.message.slice(0, 500),
      lastUsedAt: new Date(),
    },
  });
}

/** A one-token round trip, to prove the key and the model work before anyone relies on them. */
export async function testProvider(workspaceId: string, id: string): Promise<{ ok: boolean; message: string }> {
  const provider = await requireProvider(workspaceId, id);
  const apiKey = readKey(provider);
  if (!apiKey) {
    await recordProviderResult(id, { ok: false, reason: "invalid_key", message: UNREADABLE_KEY, retryable: false });
    return { ok: false, message: UNREADABLE_KEY };
  }
  const result = await chat({
    kind: provider.kind,
    apiKey,
    baseUrl: provider.baseUrl,
    model: provider.model,
    messages: [
      { role: "system", content: "Reply with the single word: ready" },
      { role: "user", content: "ping" },
    ],
    temperature: 0,
    maxTokens: 16,
    timeoutMs: 15_000,
  });

  await recordProviderResult(id, result);
  if (result.ok) return { ok: true, message: `${provider.model} answered.` };
  return { ok: false, message: result.message };
}

/** The models a saved connection's key can use, fetched live from the provider. */
export async function listProviderModels(workspaceId: string, id: string): Promise<{ models: string[] }> {
  const provider = await requireProvider(workspaceId, id);
  const apiKey = readKey(provider);
  if (!apiKey) throw new ApiError(422, UNREADABLE_KEY, "AI_MODELS_UNAVAILABLE");
  const result = await listModels({ kind: provider.kind, apiKey, baseUrl: provider.baseUrl });
  if (!result.ok) throw new ApiError(422, result.message, "AI_MODELS_UNAVAILABLE");
  return { models: result.models };
}

/** The same for a key that is being connected and has not been saved. Nothing is stored. */
export async function previewModels(input: ModelPreviewInput): Promise<{ models: string[] }> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const result = await listModels({ kind: input.kind, apiKey: input.apiKey, baseUrl });
  if (!result.ok) throw new ApiError(422, result.message, "AI_MODELS_UNAVAILABLE");
  return { models: result.models };
}

// ───────────────────────── Agents ─────────────────────────

export async function listAgents(workspaceId: string): Promise<AgentView[]> {
  const rows = await prisma.aiAgent.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(toAgentView);
}

export async function createAgent(workspaceId: string, input: AgentCreateInput): Promise<AgentView> {
  const slots = await checkWorkspaceLimit(workspaceId, "aiAgentsPerWorkspace");
  if (!slots.ok) {
    throw new ApiError(403, `Your plan allows ${slots.limit} AI agent${slots.limit === 1 ? "" : "s"} per workspace. Upgrade to add more.`, "PLAN_LIMIT");
  }

  if (input.providerId) await requireProvider(workspaceId, input.providerId);
  if (input.isDefault) await prisma.aiAgent.updateMany({ where: { workspaceId }, data: { isDefault: false } });

  // Explicit null picks the built-in model; left out, the workspace's default connection wins when it has one.
  const providerId =
    input.providerId !== undefined ? input.providerId : ((await prisma.aiProvider.findFirst({ where: { workspaceId, isDefault: true } }))?.id ?? null);

  const created = await prisma.aiAgent.create({
    data: {
      workspaceId,
      providerId,
      // The built-in model is fixed; a model name only means something on a connection.
      model: providerId ? input.model?.trim() || null : null,
      name: input.name,
      systemPrompt: input.systemPrompt,
      knowledge: input.knowledge ?? null,
      guardrails: input.guardrails ?? null,
      fallbackReply: input.fallbackReply ?? null,
      buttons: input.buttons ?? [],
      temperature: input.temperature ?? 0.6,
      maxTokens: input.maxTokens ?? 400,
      historyLimit: input.historyLimit ?? 20,
      isDefault: input.isDefault ?? slots.used === 0,
    },
  });
  logger.info("ai.agent_created", { workspaceId, agentId: created.id });
  return toAgentView(created);
}

export async function requireAgent(workspaceId: string, id: string): Promise<AiAgent> {
  const agent = await prisma.aiAgent.findFirst({ where: { id, workspaceId } });
  if (!agent) throw new ApiError(404, "That agent is not in this workspace.", "AI_AGENT_NOT_FOUND");
  return agent;
}

export async function updateAgent(workspaceId: string, id: string, input: AgentUpdateInput): Promise<AgentView> {
  const existing = await requireAgent(workspaceId, id);
  if (input.providerId) await requireProvider(workspaceId, input.providerId);
  if (input.isDefault) await prisma.aiAgent.updateMany({ where: { workspaceId }, data: { isDefault: false } });

  const providerId = input.providerId === undefined ? existing.providerId : input.providerId;
  const model = providerId === null ? null : input.model === undefined ? undefined : input.model?.trim() || null;

  const updated = await prisma.aiAgent.update({
    where: { id },
    data: {
      name: input.name,
      providerId: input.providerId,
      model,
      systemPrompt: input.systemPrompt,
      knowledge: input.knowledge,
      guardrails: input.guardrails,
      fallbackReply: input.fallbackReply,
      buttons: input.buttons,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      historyLimit: input.historyLimit,
      isDefault: input.isDefault,
    },
  });
  return toAgentView(updated);
}

export async function deleteAgent(workspaceId: string, id: string): Promise<void> {
  await requireAgent(workspaceId, id);
  await prisma.aiAgent.delete({ where: { id } });
  logger.info("ai.agent_deleted", { workspaceId, agentId: id });
}

/** The agent a flow node means: the one it names, or the workspace default. */
export async function resolveAgent(workspaceId: string, agentId: string | undefined | null): Promise<AiAgent | null> {
  if (agentId) {
    const named = await prisma.aiAgent.findFirst({ where: { id: agentId, workspaceId } });
    if (named) return named;
  }
  return prisma.aiAgent.findFirst({ where: { workspaceId, isDefault: true } });
}

/**
 * Why an agent cannot reply right now: its connection is gone, the connection's
 * key or last call failed, or it is on the built-in model and this server has
 * no key for it.
 */
export type AgentProblem = "no_provider" | "invalid_key" | "error" | "builtin_unavailable";

/** Just enough for the builder's agent picker. */
export type AgentOption = {
  id: string;
  name: string;
  isDefault: boolean;
  /** The model it replies with; null when its connection is gone. */
  model: string | null;
  /** Its connection's preset, for the logo; null on the built-in model. */
  presetId: ProviderPresetId | null;
  /** True when it replies with the built-in model. */
  builtIn: boolean;
  problem: AgentProblem | null;
};

export async function listAgentOptions(workspaceId: string): Promise<AgentOption[]> {
  const [rows, providers] = await Promise.all([
    prisma.aiAgent.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isDefault: true, providerId: true, model: true },
    }),
    prisma.aiProvider.findMany({ where: { workspaceId }, select: { id: true, kind: true, baseUrl: true, model: true, status: true, isDefault: true } }),
  ]);
  const builtIn = builtInModel();
  return rows.map((agent) => {
    if (!agent.providerId) {
      return {
        id: agent.id,
        name: agent.name,
        isDefault: agent.isDefault,
        model: builtIn.model,
        presetId: null,
        builtIn: true,
        problem: builtIn.available ? null : "builtin_unavailable",
      };
    }
    // The same connection `runAgent` would reply with.
    const provider = providers.find((p) => p.id === agent.providerId) ?? null;
    return {
      id: agent.id,
      name: agent.name,
      isDefault: agent.isDefault,
      model: provider ? agent.model?.trim() || provider.model : null,
      presetId: provider ? presetFor(provider).id : null,
      builtIn: false,
      problem: !provider ? "no_provider" : provider.status === AiProviderStatus.INVALID_KEY ? "invalid_key" : provider.status === AiProviderStatus.ERROR ? "error" : null,
    };
  });
}

// ───────────────────────── Running one ─────────────────────────

export type AgentRun =
  | { ok: true; text: string; message: OutboundMessage; buttons: AgentButton[]; handoff: boolean; done: boolean }
  | { ok: false; reason: string; message: string; retryable: boolean; fallback: string };

/** What a reply is written with: a workspace connection, or the built-in model (`providerId` null). */
type ReplyTarget = { kind: AiProviderKind; apiKey: string; baseUrl: string | null; model: string; maxTokens: number; providerId: string | null };

type TargetFailure = Extract<AgentRun, { ok: false }>;

async function replyTarget(workspaceId: string, agent: AiAgent): Promise<ReplyTarget | TargetFailure> {
  const fallback = fallbackReplyFor(agent);
  if (!agent.providerId) {
    const builtIn = builtInTarget();
    if (!builtIn) {
      return { ok: false, reason: "no_provider", message: `${BUILT_IN_LABEL} is not set up on this server.`, retryable: false, fallback };
    }
    return { ...builtIn, maxTokens: Math.min(agent.maxTokens, BUILT_IN_MAX_TOKENS), providerId: null };
  }

  const provider = await prisma.aiProvider.findFirst({ where: { id: agent.providerId, workspaceId } });
  if (!provider) {
    return { ok: false, reason: "no_provider", message: "The AI connection this agent used has been removed.", retryable: false, fallback };
  }
  const apiKey = readKey(provider);
  if (!apiKey) {
    await recordProviderResult(provider.id, { ok: false, reason: "invalid_key", message: UNREADABLE_KEY, retryable: false });
    return { ok: false, reason: "invalid_key", message: UNREADABLE_KEY, retryable: false, fallback };
  }
  return { kind: provider.kind, apiKey, baseUrl: provider.baseUrl, model: agent.model?.trim() || provider.model, maxTokens: agent.maxTokens, providerId: provider.id };
}

/** Test chats on the built-in model cost us, not the workspace: this many per workspace per hour. */
const BUILT_IN_PLAYGROUND_PER_HOUR = 40;

/**
 * Guards the playground (and its MCP twin), where nothing is sent and so no
 * DM allowance bounds how often the model is called. Only the built-in model
 * is limited: a workspace's own key is its own business.
 */
export async function assertPlaygroundAllowed(workspaceId: string, agent: AiAgent): Promise<void> {
  if (agent.providerId) return;
  await assertRateLimit("ai_playground_builtin", workspaceId, BUILT_IN_PLAYGROUND_PER_HOUR, 3_600_000);
}

/**
 * One reply from an agent.
 *
 * Usage counters are written even on a failure that consumed tokens, because
 * the workspace is paying for those and should see them. A failure comes back
 * with the fallback text so the caller can always say something.
 *
 * A reply in a script the platform rules do not allow gets one rewrite; a
 * second miss is a failure (the fallback is sent and the flow hands over)
 * rather than a message the business never agreed to.
 */
export async function runAgent(input: {
  workspaceId: string;
  agent: AiAgent;
  context: AgentContext;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
}): Promise<AgentRun> {
  const { agent } = input;
  const target = await replyTarget(input.workspaceId, agent);
  if ("ok" in target) return target;

  const messages = buildMessages(agent, input.context, input.history);
  const call = (conversation: ChatMessage[]) =>
    chat({
      kind: target.kind,
      apiKey: target.apiKey,
      baseUrl: target.baseUrl,
      model: target.model,
      messages: conversation,
      temperature: agent.temperature,
      maxTokens: target.maxTokens,
    });

  let result = await call(messages);
  if (target.providerId) await recordProviderResult(target.providerId, result);

  if (!result.ok) {
    logger.warn("ai.reply_failed", { workspaceId: input.workspaceId, agentId: agent.id, builtIn: !target.providerId, reason: result.reason });
    return { ok: false, reason: result.reason, message: result.message, retryable: result.retryable, fallback: fallbackReplyFor(agent) };
  }

  let usage = result.usage;
  let wrongScript = hasOtherScript(result.text);
  if (wrongScript) {
    const rewrite = await call([...messages, { role: "assistant", content: result.text }, { role: "user", content: LANGUAGE_CORRECTION }]);
    if (rewrite.ok) {
      usage = { promptTokens: usage.promptTokens + rewrite.usage.promptTokens, completionTokens: usage.completionTokens + rewrite.usage.completionTokens };
      wrongScript = hasOtherScript(rewrite.text);
      if (!wrongScript) result = rewrite;
    }
  }

  await prisma.aiAgent.update({
    where: { id: agent.id },
    data: {
      repliesSent: { increment: wrongScript ? 0 : 1 },
      promptTokens: { increment: usage.promptTokens },
      completionTokens: { increment: usage.completionTokens },
    },
  });

  if (wrongScript) {
    logger.warn("ai.reply_wrong_script", { workspaceId: input.workspaceId, agentId: agent.id });
    return {
      ok: false,
      reason: "language",
      message: "The model kept replying in a script other than English or Romanized Nepali.",
      retryable: false,
      fallback: fallbackReplyFor(agent),
    };
  }

  const parsed = parseReply(result.text, readAgentButtons(agent.buttons));
  if (!parsed.text) {
    return { ok: false, reason: "empty", message: "The model replied with nothing to send.", retryable: true, fallback: fallbackReplyFor(agent) };
  }
  return {
    ok: true,
    text: parsed.text,
    message: toOutboundMessage(parsed),
    buttons: parsed.buttons,
    handoff: parsed.handoff,
    done: parsed.done,
  };
}

/** The agent a workspace gets when it first turns AI on. */
export async function createStarterAgent(workspaceId: string, name = "Front desk"): Promise<AgentView> {
  return createAgent(workspaceId, {
    name,
    systemPrompt: STARTER_PROMPT,
    guardrails: STARTER_GUARDRAILS,
    isDefault: true,
  });
}
