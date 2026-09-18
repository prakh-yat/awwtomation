/**
 * Providers and agents: the bring-your-own-key side of the product.
 *
 * The workspace's API key is encrypted with APP_ENCRYPTION_KEY and only ever
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
  parseReply,
  readAgentButtons,
  STARTER_GUARDRAILS,
  STARTER_PROMPT,
  toOutboundMessage,
  type AgentButton,
  type AgentContext,
} from "@/lib/ai/agent";
import { chat, checkBaseUrl } from "@/lib/ai/providers";
import type { ChatResult } from "@/lib/ai/types";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import type { OutboundMessage } from "@/lib/meta/types";
import { logger } from "@/lib/logger";
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

export const providerUpdateSchema = providerCreateSchema.partial().extend({
  /** Omitted when the key is not being changed; the stored one is kept. */
  apiKey: z.string().trim().min(8).max(500).optional(),
  isDefault: z.boolean().optional(),
});
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;

export const agentCreateSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  providerId: z.string().max(64).nullable().optional(),
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
  providerId: string | null;
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
  const result = await chat({
    kind: provider.kind,
    apiKey: decrypt(provider.apiKeyEnc),
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

// ───────────────────────── Agents ─────────────────────────

export async function listAgents(workspaceId: string): Promise<AgentView[]> {
  const rows = await prisma.aiAgent.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(toAgentView);
}

export async function createAgent(workspaceId: string, input: AgentCreateInput): Promise<AgentView> {
  const count = await prisma.aiAgent.count({ where: { workspaceId } });
  if (count >= 25) throw new ApiError(400, "That is as many agents as one workspace can hold.", "AI_AGENT_LIMIT");

  if (input.providerId) await requireProvider(workspaceId, input.providerId);
  if (input.isDefault) await prisma.aiAgent.updateMany({ where: { workspaceId }, data: { isDefault: false } });

  const fallbackProvider = input.providerId ?? (await prisma.aiProvider.findFirst({ where: { workspaceId, isDefault: true } }))?.id ?? null;

  const created = await prisma.aiAgent.create({
    data: {
      workspaceId,
      providerId: fallbackProvider,
      name: input.name,
      systemPrompt: input.systemPrompt,
      knowledge: input.knowledge ?? null,
      guardrails: input.guardrails ?? null,
      fallbackReply: input.fallbackReply ?? null,
      buttons: input.buttons ?? [],
      temperature: input.temperature ?? 0.6,
      maxTokens: input.maxTokens ?? 400,
      historyLimit: input.historyLimit ?? 20,
      isDefault: input.isDefault ?? count === 0,
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
  await requireAgent(workspaceId, id);
  if (input.providerId) await requireProvider(workspaceId, input.providerId);
  if (input.isDefault) await prisma.aiAgent.updateMany({ where: { workspaceId }, data: { isDefault: false } });

  const updated = await prisma.aiAgent.update({
    where: { id },
    data: {
      name: input.name,
      providerId: input.providerId,
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

/** Just enough for the builder's agent picker. */
export type AgentOption = { id: string; name: string; isDefault: boolean };

export async function listAgentOptions(workspaceId: string): Promise<AgentOption[]> {
  const rows = await prisma.aiAgent.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  });
  return rows;
}

// ───────────────────────── Running one ─────────────────────────

export type AgentRun =
  | { ok: true; text: string; message: OutboundMessage; buttons: AgentButton[]; handoff: boolean; done: boolean }
  | { ok: false; reason: string; message: string; retryable: boolean; fallback: string };

/**
 * One reply from an agent.
 *
 * Usage counters are written even on a failure that consumed tokens, because
 * the workspace is paying for those and should see them. A failure comes back
 * with the fallback text so the caller can always say something.
 */
export async function runAgent(input: {
  workspaceId: string;
  agent: AiAgent;
  context: AgentContext;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
}): Promise<AgentRun> {
  const { agent } = input;
  const provider = agent.providerId
    ? await prisma.aiProvider.findFirst({ where: { id: agent.providerId, workspaceId: input.workspaceId } })
    : await prisma.aiProvider.findFirst({ where: { workspaceId: input.workspaceId, isDefault: true } });

  if (!provider) {
    return {
      ok: false,
      reason: "no_provider",
      message: "No AI provider is connected for this workspace.",
      retryable: false,
      fallback: fallbackReplyFor(agent),
    };
  }

  const result = await chat({
    kind: provider.kind,
    apiKey: decrypt(provider.apiKeyEnc),
    baseUrl: provider.baseUrl,
    model: provider.model,
    messages: buildMessages(agent, input.context, input.history),
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
  });

  await recordProviderResult(provider.id, result);

  if (!result.ok) {
    logger.warn("ai.reply_failed", { workspaceId: input.workspaceId, agentId: agent.id, reason: result.reason });
    return { ok: false, reason: result.reason, message: result.message, retryable: result.retryable, fallback: fallbackReplyFor(agent) };
  }

  await prisma.aiAgent.update({
    where: { id: agent.id },
    data: {
      repliesSent: { increment: 1 },
      promptTokens: { increment: result.usage.promptTokens },
      completionTokens: { increment: result.usage.completionTokens },
    },
  });

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
