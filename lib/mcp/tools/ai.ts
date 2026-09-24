/**
 * The AI page as tools: provider connections (the workspace's own API keys)
 * and agents. Keys go in, never out: every provider comes back as the same
 * four character hint the page shows.
 */
import { z } from "zod";

import { PROVIDER_PRESETS, presetById, type ProviderPresetId } from "@/lib/ai/presets";
import {
  agentCreateSchema,
  agentUpdateSchema,
  createAgent,
  createProvider,
  deleteAgent,
  deleteProvider,
  listAgents,
  listProviderModels,
  listProviders,
  modelPreviewSchema,
  playgroundSchema,
  previewModels,
  providerCreateSchema,
  providerUpdateSchema,
  requireAgent,
  runAgent,
  testProvider,
  updateAgent,
  updateProvider,
} from "@/lib/services/ai";
import { listChannelOptions } from "@/lib/services/automations";
import { ApiError } from "@/lib/workspace/api";

import { compact, workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const PRESET_IDS = PROVIDER_PRESETS.map((p) => p.id) as [ProviderPresetId, ...ProviderPresetId[]];

const kind = z.enum(["OPENAI_COMPATIBLE", "ANTHROPIC", "GOOGLE"]).describe("The request shape. Normally set by preset.");
const providerId = z.string().describe("Provider id from list_ai_providers.");
const agentId = z.string().describe("Agent id from list_ai_agents.");

type ResolvedPreset = { kind?: string; baseUrl?: string; label?: string; model?: string };

/** kind and baseUrl from a preset, unless given explicitly. The custom preset has no endpoint of its own. */
function fromPreset(presetId: ProviderPresetId | undefined, given: { kind?: string; baseUrl?: string }): ResolvedPreset {
  if (!presetId) return given;
  const preset = presetById(presetId);
  if (presetId === "custom" && !given.baseUrl) throw new ApiError(422, "A custom endpoint needs baseUrl.", "VALIDATION");
  return { kind: given.kind ?? preset.kind, baseUrl: given.baseUrl ?? preset.baseUrl ?? undefined, label: preset.name, model: preset.models[0] };
}

const agentFields = {
  name: z.string().optional().describe("Up to 60 characters."),
  providerId: z.string().nullable().optional().describe("Which connection it uses. Null uses the default connection."),
  model: z.string().nullable().optional().describe("A model id from list_ai_models. Null uses the connection's default model."),
  systemPrompt: z.string().optional().describe("Who the agent is and how it talks, in the workspace's own words. Used verbatim."),
  knowledge: z.string().nullable().optional().describe("Facts it may use: prices, hours, policies, links."),
  guardrails: z.string().nullable().optional().describe("Hard rules added after the prompt, such as never quoting a price."),
  fallbackReply: z.string().nullable().optional().describe("Sent when the model call fails, so a contact is never left without a reply."),
  buttons: z
    .array(z.object({ title: z.string().describe("Up to 20 characters."), url: z.string().describe("https:// link.") }))
    .optional()
    .describe("Link buttons the agent may attach by naming their title. Up to 3."),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(60).max(4000).optional().describe("Longest reply, in tokens."),
  historyLimit: z.number().int().min(2).max(50).optional().describe("How many recent messages it reads."),
  isDefault: z.boolean().optional().describe("Use this agent when a flow step names none."),
};

export const aiTools = [
  workspaceTool({
    name: "list_ai_providers",
    title: "List AI connections",
    description:
      "The workspace's AI provider connections (its own API keys; only the last four characters are ever shown) and the presets that can be connected: OpenAI, Anthropic, Google, OpenRouter, xAI, Mistral, DeepSeek, Groq and more, or a custom endpoint.",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => ({
      providers: await listProviders(ctx.workspace.id),
      presets: PROVIDER_PRESETS.map((p) => ({ preset: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, getKeyAt: p.keyUrl, suggestedModels: p.models.slice(0, 6) })),
    }),
  }),

  workspaceTool({
    name: "list_ai_models",
    title: "List AI models",
    description:
      "Models a connection can use, live from the provider. Pass providerId for a saved connection, or preset (or kind and baseUrl) with apiKey to check a key before saving it. Admins and owners.",
    minRole: "ADMIN",
    annotations: READ,
    input: {
      providerId: providerId.optional(),
      preset: z.enum(PRESET_IDS).optional(),
      kind: kind.optional(),
      apiKey: z.string().optional().describe("Only to check a key that is not saved yet. It is not stored."),
      baseUrl: z.string().optional(),
    },
    run: async (args, ctx) => {
      if (args.providerId) return listProviderModels(ctx.workspace.id, args.providerId);
      const resolved = fromPreset(args.preset, compact({ kind: args.kind, baseUrl: args.baseUrl }));
      return previewModels(modelPreviewSchema.parse(compact({ kind: resolved.kind, apiKey: args.apiKey, baseUrl: resolved.baseUrl })));
    },
  }),

  workspaceTool({
    name: "connect_ai_provider",
    title: "Connect an AI provider",
    description:
      "Save an API key for a model provider so agents can use it. Replies are billed by the provider to the workspace's own account. Pick a preset (it fills kind and endpoint) and a default model from list_ai_models. The first connection becomes the default. Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: {
      preset: z.enum(PRESET_IDS).optional().describe("openai, anthropic, google, openrouter and so on, or custom with baseUrl."),
      apiKey: z.string().describe("The provider's API key. Stored encrypted and never shown again."),
      model: z.string().optional().describe("Default model id. Defaults to the preset's first suggestion."),
      label: z.string().optional().describe("A name for this connection. Defaults to the provider's name."),
      kind: kind.optional(),
      baseUrl: z.string().optional().describe("Endpoint, for a custom or self-hosted provider."),
    },
    run: async (args, ctx) => {
      const resolved = fromPreset(args.preset, compact({ kind: args.kind, baseUrl: args.baseUrl }));
      const input = providerCreateSchema.parse(
        compact({
          label: args.label ?? resolved.label,
          kind: resolved.kind,
          apiKey: args.apiKey,
          baseUrl: resolved.baseUrl,
          model: args.model ?? resolved.model,
        }),
      );
      return { provider: await createProvider(ctx.workspace.id, input) };
    },
  }),

  workspaceTool({
    name: "update_ai_provider",
    title: "Update an AI connection",
    description: "Rename a connection, change its default model or endpoint, replace its key, or make it the default. Leave apiKey out to keep the saved one. Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: {
      providerId,
      label: z.string().optional(),
      model: z.string().optional(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      kind: kind.optional(),
      isDefault: z.boolean().optional(),
    },
    run: async (args, ctx) => {
      const { providerId: id, ...fields } = args;
      return { provider: await updateProvider(ctx.workspace.id, id, providerUpdateSchema.parse(compact(fields))) };
    },
  }),

  workspaceTool({
    name: "test_ai_provider",
    title: "Test an AI connection",
    description: "Send one tiny request with the saved key to prove it works. Admins and owners.",
    minRole: "ADMIN",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    input: { providerId },
    run: async (args, ctx) => testProvider(ctx.workspace.id, args.providerId),
  }),

  workspaceTool({
    name: "delete_ai_provider",
    title: "Remove an AI connection",
    description: "Delete a connection and its key. Agents that used it fall back to the default connection. Admins and owners.",
    minRole: "ADMIN",
    annotations: DESTROY,
    input: { providerId },
    run: async (args, ctx) => {
      await deleteProvider(ctx.workspace.id, args.providerId);
      return { ok: true };
    },
  }),

  workspaceTool({
    name: "list_ai_agents",
    title: "List AI agents",
    description: "The workspace's AI agents with their prompt, knowledge, guardrails, fallback reply, buttons, model settings and usage. Flows use an agent in an ai_reply step.",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => ({ agents: await listAgents(ctx.workspace.id) }),
  }),

  workspaceTool({
    name: "create_ai_agent",
    title: "Create an AI agent",
    description:
      "Create an agent that answers DMs: a prompt in the workspace's voice, knowledge to draw on, guardrails, a fallback reply and link buttons it may attach. Needs an AI connection (connect_ai_provider). Try it with test_ai_agent. Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: {
      ...agentFields,
      name: z.string().describe("Up to 60 characters."),
      systemPrompt: z.string().describe("Who the agent is and how it talks, in the workspace's own words. Used verbatim."),
    },
    run: async (args, ctx) => ({ agent: await createAgent(ctx.workspace.id, agentCreateSchema.parse(compact(args))) }),
  }),

  workspaceTool({
    name: "update_ai_agent",
    title: "Update an AI agent",
    description: "Change any part of an agent. Fields left out stay as they are. Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: { agentId, ...agentFields },
    run: async (args, ctx) => {
      const { agentId: id, ...fields } = args;
      return { agent: await updateAgent(ctx.workspace.id, id, agentUpdateSchema.parse(compact(fields))) };
    },
  }),

  workspaceTool({
    name: "delete_ai_agent",
    title: "Delete an AI agent",
    description: "Delete an agent. Flow steps that used it need another agent before their automation can run. Admins and owners.",
    minRole: "ADMIN",
    annotations: DESTROY,
    input: { agentId },
    run: async (args, ctx) => {
      await deleteAgent(ctx.workspace.id, args.agentId);
      return { ok: true };
    },
  }),

  workspaceTool({
    name: "test_ai_agent",
    title: "Chat with an AI agent",
    description:
      "Send a practice conversation to an agent and get the reply a contact would get, including any buttons and whether it asked for a person (handoff) or ended the chat (done). Uses the workspace's own key; nothing is sent to anyone.",
    annotations: { readOnlyHint: true, openWorldHint: true },
    input: {
      agentId,
      messages: z
        .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
        .min(1)
        .max(40)
        .describe("The conversation so far; user is the contact. End with a user message."),
    },
    run: async (args, ctx) => {
      const { agentId: id, messages } = playgroundSchema.parse(args);
      const agent = await requireAgent(ctx.workspace.id, id);
      const channels = await listChannelOptions(ctx.workspace.id);
      const channel = channels.find((c) => c.status === "ACTIVE") ?? channels[0];
      const outcome = await runAgent({
        workspaceId: ctx.workspace.id,
        agent,
        context: {
          accountHandle: channel?.username ? `@${channel.username}` : (channel?.name ?? "this account"),
          platform: channel?.platform === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM",
          contactName: "Sita",
          trigger: null,
        },
        history: messages,
      });
      if (!outcome.ok) throw new ApiError(502, `${outcome.message} The contact would get the fallback reply${outcome.fallback ? `: ${outcome.fallback}` : "."}`, "AI_ERROR");
      return { reply: outcome.text, buttons: outcome.buttons, handoff: outcome.handoff, done: outcome.done };
    },
  }),
];
