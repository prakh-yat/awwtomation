import { z } from "zod";
import type { OutboundMessage } from "@/lib/meta/types";
import { MAX_BUTTONS, MAX_BUTTON_TITLE_CHARS, MAX_QUICK_REPLIES, MAX_QUICK_REPLY_TITLE_CHARS, MAX_TEXT_BYTES, utf8Bytes } from "@/lib/meta/messages";

// ───────────────────────── Types ─────────────────────────

export type FlowNodeType = "trigger" | "send_message" | "ask_question" | "condition_follow" | "delay" | "add_tag" | "remove_tag";

/** How an "Ask a question" answer is checked before it is saved. */
export type AnswerValidation = "none" | "email" | "phone" | "number";

export type FlowNodeData =
  | { type: "trigger" }
  /** buttons[i] of type postback get payload `btn:${nodeId}:${i}` automatically at send time. */
  | { type: "send_message"; message: OutboundMessage }
  /**
   * Sends `prompt` (quick replies act as suggested answers, payload `qr:${nodeId}:${i}`),
   * then waits for the contact's next message and stores it on the contact:
   * `saveTo` "name" → contact.name, anything else → contact.customFields[saveTo].
   * Only a "next" handle; a wrong answer re-asks with `retryPrompt` up to `maxRetries` times.
   */
  | { type: "ask_question"; prompt: OutboundMessage; saveTo: string; validation?: AnswerValidation; retryPrompt?: string; maxRetries?: number }
  /** yes/no handles. `retryPrompt` is sent (with a "check again" button) when there is no "no" edge. */
  | { type: "condition_follow"; retryPrompt?: string }
  | { type: "delay"; seconds: number }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string };

export type FlowNode = { id: string; type: FlowNodeType; position: { x: number; y: number }; data: FlowNodeData };

/** handles: "next" (default), "yes"/"no" (condition), `btn:${i}` (message buttons), `qr:${i}` (quick replies). */
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string };

export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

export const MAX_DELAY_SECONDS = 7 * 24 * 3600;
export const MAX_TAG_LENGTH = 64;
export const MAX_FLOW_NODES = 100;

// ───────────────────────── Ask a question ─────────────────────────

/** Custom field keys are lowercase snake_case so they are safe as template variables ({{email}}). */
export const SAVE_TO_KEY_RE = /^[a-z0-9_]{1,32}$/;
export const MAX_ASK_RETRIES = 5;
export const DEFAULT_ASK_RETRIES = 2;
export const DEFAULT_ASK_RETRY_PROMPT = "Sorry, that doesn't look right — please try again.";
/** Mirrors the contacts service's per-field value cap so engine writes never exceed what the UI accepts. */
export const MAX_ANSWER_LENGTH = 1000;

export type AskQuestionField = { key: string; label: string; validation: AnswerValidation; hint: string };

/** Built-in destinations offered first in the "Save to" picker; anything else is a custom field key. */
export const ASK_QUESTION_FIELDS: readonly AskQuestionField[] = [
  { key: "name", label: "Name", validation: "none", hint: "Stored as the contact's name" },
  { key: "email", label: "Email", validation: "email", hint: "Stored in the contact's custom fields" },
  { key: "phone", label: "Phone", validation: "phone", hint: "Stored in the contact's custom fields" },
];

export function askQuestionFieldLabel(saveTo: string): string {
  return ASK_QUESTION_FIELDS.find((f) => f.key === saveTo)?.label ?? saveTo;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{7,15}$/;

/**
 * Check a free-text answer and return the value to store, or null when it
 * fails. Emails are lower-cased; phones lose spacing/punctuation and keep an
 * optional leading "+"; numbers are stored as numbers. Every kind rejects an
 * empty answer — there is nothing to save.
 */
export function validateAnswer(text: string, validation: AnswerValidation = "none"): string | number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  switch (validation) {
    case "email": {
      const value = trimmed.toLowerCase();
      return EMAIL_RE.test(value) && value.length <= MAX_ANSWER_LENGTH ? value : null;
    }
    case "phone": {
      const value = trimmed.replace(/[\s().-]/g, "");
      return PHONE_RE.test(value) ? value : null;
    }
    case "number": {
      const value = Number(trimmed.replace(/,/g, ""));
      return Number.isFinite(value) ? value : null;
    }
    default:
      return Array.from(trimmed).slice(0, MAX_ANSWER_LENGTH).join("");
  }
}

// ───────────────────────── Zod ─────────────────────────

export const outboundButtonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("web_url"), title: z.string().min(1).max(80), url: z.string().url().max(2048) }),
  z.object({ type: z.literal("postback"), title: z.string().min(1).max(80), payload: z.string().max(1000) }),
]);

export const outboundMessageSchema: z.ZodType<OutboundMessage> = z.object({
  text: z.string().max(4000).optional(),
  buttons: z.array(outboundButtonSchema).max(10).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  quickReplies: z.array(z.object({ title: z.string().min(1).max(80), payload: z.string().max(1000) })).max(20).optional(),
});

const flowNodeTypeSchema = z.enum(["trigger", "send_message", "ask_question", "condition_follow", "delay", "add_tag", "remove_tag"]);

const answerValidationSchema = z.enum(["none", "email", "phone", "number"]);

const flowNodeDataSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("trigger") }),
  z.object({ type: z.literal("send_message"), message: outboundMessageSchema }),
  // `saveTo` is only length-checked here so a half-edited draft still saves; validateFlow enforces the key format before activation.
  z.object({
    type: z.literal("ask_question"),
    prompt: outboundMessageSchema,
    saveTo: z.string().max(32),
    validation: answerValidationSchema.optional(),
    retryPrompt: z.string().max(4000).optional(),
    maxRetries: z.number().int().min(0).max(MAX_ASK_RETRIES).optional(),
  }),
  z.object({ type: z.literal("condition_follow"), retryPrompt: z.string().max(4000).optional() }),
  z.object({ type: z.literal("delay"), seconds: z.number().int().min(1).max(MAX_DELAY_SECONDS) }),
  z.object({ type: z.literal("add_tag"), tag: z.string().min(1).max(MAX_TAG_LENGTH) }),
  z.object({ type: z.literal("remove_tag"), tag: z.string().min(1).max(MAX_TAG_LENGTH) }),
]);

const flowNodeSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: flowNodeTypeSchema,
    position: z.object({ x: z.number(), y: z.number() }),
    data: flowNodeDataSchema,
  })
  .refine((n) => n.type === n.data.type, { message: "node.type must match node.data.type", path: ["type"] });

const flowEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().max(64).optional(),
});

export const flowGraphSchema: z.ZodType<FlowGraph> = z.object({
  nodes: z.array(flowNodeSchema).max(MAX_FLOW_NODES),
  edges: z.array(flowEdgeSchema).max(MAX_FLOW_NODES * 4),
});

// ───────────────────────── Defaults ─────────────────────────

/** Trigger → one message with a link button. The first line discloses automation (Meta policy). */
export function defaultFlow(): FlowGraph {
  return {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { type: "trigger" } },
      {
        id: "message-1",
        type: "send_message",
        position: { x: 0, y: 180 },
        data: {
          type: "send_message",
          message: {
            text: "Thanks for commenting! Here's your link 👇",
            buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
          },
        },
      },
    ],
    edges: [{ id: "edge-trigger-message-1", source: "trigger", target: "message-1", sourceHandle: "next" }],
  };
}

// ───────────────────────── Graph helpers ─────────────────────────

export function normalizeHandle(handle?: string | null): string {
  return !handle || handle === "next" || handle === "default" ? "next" : handle;
}

export function getNode(flow: FlowGraph, nodeId: string): FlowNode | undefined {
  return flow.nodes.find((n) => n.id === nodeId);
}

export function findTriggerNode(flow: FlowGraph): FlowNode | undefined {
  return flow.nodes.find((n) => n.data.type === "trigger");
}

export function outgoingEdges(flow: FlowGraph, nodeId: string): FlowEdge[] {
  return flow.edges.filter((e) => e.source === nodeId);
}

/** The node an edge with the given handle leads to (undefined handle == "next"). */
export function nextNodeId(flow: FlowGraph, fromNodeId: string, handle?: string): string | null {
  const wanted = normalizeHandle(handle);
  const edge = flow.edges.find((e) => e.source === fromNodeId && normalizeHandle(e.sourceHandle) === wanted);
  if (!edge) return null;
  return getNode(flow, edge.target) ? edge.target : null;
}

export function firstNodeAfterTrigger(flow: FlowGraph): string | null {
  const trigger = findTriggerNode(flow);
  return trigger ? nextNodeId(flow, trigger.id, "next") : null;
}

// ───────────────────────── Validation ─────────────────────────

const HANDLES_BY_TYPE: Record<FlowNodeType, (node: FlowNode) => string[]> = {
  trigger: () => ["next"],
  send_message: (node) => {
    if (node.data.type !== "send_message") return ["next"];
    const buttons = node.data.message.buttons ?? [];
    const quick = node.data.message.quickReplies ?? [];
    return [
      "next",
      ...buttons.map((b, i) => (b.type === "postback" ? `btn:${i}` : "")).filter(Boolean),
      ...quick.map((_, i) => `qr:${i}`),
    ];
  },
  // Quick replies on a question are suggested answers, not branches — the answer always continues via "next".
  ask_question: () => ["next"],
  condition_follow: () => ["yes", "no"],
  delay: () => ["next"],
  add_tag: () => ["next"],
  remove_tag: () => ["next"],
};

/**
 * Business rules the editor must satisfy before an automation can go ACTIVE:
 * one trigger, every node reachable, no dangling edges/handles, Meta content limits.
 */
export function validateFlow(flow: FlowGraph): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const ids = new Map<string, FlowNode>();
  for (const node of flow.nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate node id "${node.id}"`);
    ids.set(node.id, node);
  }

  const triggers = flow.nodes.filter((n) => n.data.type === "trigger");
  if (triggers.length !== 1) errors.push(`Flow must have exactly one trigger (found ${triggers.length})`);

  for (const edge of flow.edges) {
    const source = ids.get(edge.source);
    if (!source) {
      errors.push(`Edge "${edge.id}" starts at unknown node "${edge.source}"`);
      continue;
    }
    if (!ids.has(edge.target)) {
      errors.push(`Edge "${edge.id}" points to unknown node "${edge.target}"`);
      continue;
    }
    const allowed = HANDLES_BY_TYPE[source.type](source);
    const handle = normalizeHandle(edge.sourceHandle);
    if (!allowed.includes(handle)) errors.push(`Edge "${edge.id}" uses handle "${handle}" which does not exist on node "${source.id}"`);
  }

  // Two edges from the same handle would make execution ambiguous.
  const seenHandles = new Set<string>();
  for (const edge of flow.edges) {
    const key = `${edge.source}::${normalizeHandle(edge.sourceHandle)}`;
    if (seenHandles.has(key)) errors.push(`Node "${edge.source}" has more than one edge on handle "${normalizeHandle(edge.sourceHandle)}"`);
    seenHandles.add(key);
  }

  for (const node of flow.nodes) {
    const data = node.data;
    if (data.type === "send_message") {
      const m = data.message;
      const text = m.text ?? "";
      const buttons = m.buttons ?? [];
      if (!text.trim() && !m.imageUrl) errors.push(`Message "${node.id}" needs text or an image`);
      if (utf8Bytes(text) > MAX_TEXT_BYTES) errors.push(`Message "${node.id}" text exceeds ${MAX_TEXT_BYTES} bytes`);
      if (buttons.length > MAX_BUTTONS) errors.push(`Message "${node.id}" has more than ${MAX_BUTTONS} buttons`);
      if (buttons.length > 0 && Array.from(text).length > 640) errors.push(`Message "${node.id}" text must be ≤ 640 characters when it has buttons`);
      buttons.forEach((b, i) => {
        if (Array.from(b.title).length > MAX_BUTTON_TITLE_CHARS) errors.push(`Button ${i + 1} on "${node.id}" title exceeds ${MAX_BUTTON_TITLE_CHARS} characters`);
        if (b.type === "web_url" && !/^https?:\/\//i.test(b.url)) errors.push(`Button ${i + 1} on "${node.id}" must link to an http(s) URL`);
      });
      if ((m.quickReplies ?? []).length > MAX_QUICK_REPLIES) errors.push(`Message "${node.id}" has more than ${MAX_QUICK_REPLIES} quick replies`);
    } else if (data.type === "ask_question") {
      const text = data.prompt.text ?? "";
      const quick = data.prompt.quickReplies ?? [];
      if (!text.trim()) errors.push(`Question "${node.id}" needs prompt text`);
      if (utf8Bytes(text) > MAX_TEXT_BYTES) errors.push(`Question "${node.id}" prompt exceeds ${MAX_TEXT_BYTES} bytes`);
      if ((data.prompt.buttons ?? []).length > 0) errors.push(`Question "${node.id}" can't have buttons — use quick replies for suggested answers`);
      if (quick.length > MAX_QUICK_REPLIES) errors.push(`Question "${node.id}" has more than ${MAX_QUICK_REPLIES} quick replies`);
      quick.forEach((q, i) => {
        if (!q.title.trim()) errors.push(`Quick reply ${i + 1} on "${node.id}" needs a title`);
        else if (Array.from(q.title).length > MAX_QUICK_REPLY_TITLE_CHARS) errors.push(`Quick reply ${i + 1} on "${node.id}" title exceeds ${MAX_QUICK_REPLY_TITLE_CHARS} characters`);
      });
      if (!data.saveTo.trim()) errors.push(`Question "${node.id}" needs a field to save the answer to`);
      else if (!SAVE_TO_KEY_RE.test(data.saveTo)) errors.push(`Question "${node.id}" field key must be 1–32 lowercase letters, digits or underscores`);
      if (data.retryPrompt && utf8Bytes(data.retryPrompt) > MAX_TEXT_BYTES) errors.push(`Question "${node.id}" retry prompt exceeds ${MAX_TEXT_BYTES} bytes`);
    } else if (data.type === "delay") {
      if (!Number.isInteger(data.seconds) || data.seconds < 1 || data.seconds > MAX_DELAY_SECONDS) {
        errors.push(`Delay "${node.id}" must be between 1 second and 7 days`);
      }
    } else if (data.type === "add_tag" || data.type === "remove_tag") {
      if (!data.tag.trim()) errors.push(`Tag node "${node.id}" needs a tag name`);
    } else if (data.type === "condition_follow") {
      if (data.retryPrompt && utf8Bytes(data.retryPrompt) > MAX_TEXT_BYTES) errors.push(`Follow check "${node.id}" retry prompt exceeds ${MAX_TEXT_BYTES} bytes`);
    }
  }

  // Reachability from the trigger — orphan nodes are almost always an editing mistake.
  const trigger = triggers[0];
  if (trigger) {
    const reachable = new Set<string>([trigger.id]);
    const stack = [trigger.id];
    while (stack.length) {
      const current = stack.pop() as string;
      for (const edge of flow.edges) {
        if (edge.source === current && ids.has(edge.target) && !reachable.has(edge.target)) {
          reachable.add(edge.target);
          stack.push(edge.target);
        }
      }
    }
    for (const node of flow.nodes) {
      if (!reachable.has(node.id)) errors.push(`Node "${node.id}" is not connected to the trigger`);
    }
    if (!nextNodeId(flow, trigger.id, "next")) errors.push("The trigger must connect to a first step");
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

// ───────────────────────── Templates ─────────────────────────

const TEMPLATE_RE = /\{\{\s*([A-Za-z_][\w.]*)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

/**
 * `{{username}}`, `{{name}}`, `{{first_name}}` with optional fallback:
 * `{{name|there}}`. Unknown keys render as the fallback or empty string.
 */
export function renderTemplate(text: string, vars: Record<string, string | undefined>): string {
  if (!text || !text.includes("{{")) return text;
  const lookup = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) lookup.set(key.toLowerCase(), value);
  return text.replace(TEMPLATE_RE, (_m, key: string, fallback?: string) => {
    const value = lookup.get(key.toLowerCase());
    return value && value.trim() ? value : (fallback ?? "");
  });
}
