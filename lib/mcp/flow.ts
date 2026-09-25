/**
 * Automation flows as an AI app writes them.
 *
 * The builder stores a canvas: every step has an x/y position and an edge id.
 * A model should not have to invent coordinates, so here positions and edge ids
 * are optional, the trigger step may be left out, and postback payloads are
 * filled in (the engine overwrites them at send time anyway). `toFlowGraph`
 * turns that into the exact `FlowGraph` the builder saves, which then goes
 * through the same `automationInputSchema` as the API.
 */
import { z } from "zod";

import {
  DEFAULT_AI_TURNS,
  DEFAULT_ASK_RETRIES,
  MAX_AI_TURNS,
  MAX_ASK_RETRIES,
  MAX_DELAY_SECONDS,
  MAX_FLOW_NODES,
  MAX_TAG_LENGTH,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type FlowNodeData,
} from "@/lib/automation/flow-types";
import { MAX_BUTTON_TITLE_CHARS, MAX_BUTTONS, MAX_QUICK_REPLIES } from "@/lib/meta/messages";
import type { OutboundMessage } from "@/lib/meta/types";

const link = z.string().trim().max(2048).describe("A full https:// link.");

const buttonInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("web_url"),
    title: z.string().min(1).max(80).describe(`Button label, up to ${MAX_BUTTON_TITLE_CHARS} characters.`),
    url: link,
  }),
  z.object({
    type: z.literal("postback"),
    title: z.string().min(1).max(80).describe(`Button label, up to ${MAX_BUTTON_TITLE_CHARS} characters.`),
    payload: z.string().max(1000).optional().describe("Leave out: the flow sets it. Branch on the tap with an edge whose sourceHandle is btn:<button index>."),
  }),
]);

const quickReplyInput = z.object({
  title: z.string().min(1).max(80).describe(`Up to ${MAX_BUTTON_TITLE_CHARS} characters.`),
  payload: z.string().max(1000).optional().describe("Leave out: the flow sets it."),
});

/** One DM as the model writes it. */
export const messageInput = z.object({
  text: z
    .string()
    .max(4000)
    .optional()
    .describe("Message text. May use {{first_name}}, {{name}}, {{username}} and saved fields such as {{email}}, with a fallback after a bar: {{first_name|there}}."),
  buttons: z.array(buttonInput).max(10).optional().describe(`Up to ${MAX_BUTTONS} buttons.`),
  imageUrl: link.optional(),
  quickReplies: z.array(quickReplyInput).max(20).optional().describe(`Up to ${MAX_QUICK_REPLIES} tappable replies.`),
});

const nodeDataInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("trigger") }),
  z.object({ type: z.literal("send_message"), message: messageInput }),
  z.object({
    type: z.literal("ask_question"),
    prompt: messageInput.describe("The question. Quick replies act as suggested answers; buttons are not allowed."),
    saveTo: z.string().max(32).describe('Where the answer is stored: "name", "email", "phone", or a custom field key in lowercase snake_case.'),
    validation: z.enum(["none", "email", "phone", "number"]).optional(),
    retryPrompt: z.string().max(4000).optional().describe("Sent when the answer fails validation."),
    maxRetries: z.number().int().min(0).max(MAX_ASK_RETRIES).optional().describe(`Defaults to ${DEFAULT_ASK_RETRIES}.`),
  }),
  z.object({
    type: z.literal("ai_reply"),
    agentId: z.string().max(64).optional().describe("An AI agent id from list_ai_agents."),
    instruction: z.string().max(4000).optional().describe("Added to the agent's prompt for this step only."),
    maxTurns: z.number().int().min(1).max(MAX_AI_TURNS).optional().describe(`How many times it answers before moving on. Defaults to ${DEFAULT_AI_TURNS}.`),
  }),
  z.object({
    type: z.literal("condition_follow"),
    retryPrompt: z.string().max(4000).optional().describe('Sent with a "check again" button when the contact does not follow and there is no "no" edge.'),
  }),
  z.object({ type: z.literal("delay"), seconds: z.number().int().min(1).max(MAX_DELAY_SECONDS).describe("1 second to 7 days.") }),
  z.object({ type: z.literal("add_tag"), tag: z.string().min(1).max(MAX_TAG_LENGTH) }),
  z.object({ type: z.literal("remove_tag"), tag: z.string().min(1).max(MAX_TAG_LENGTH) }),
  z.object({ type: z.literal("add_to_pipeline"), pipelineId: z.string().max(64), stageId: z.string().max(64) }),
  z.object({ type: z.literal("move_stage"), pipelineId: z.string().max(64), stageId: z.string().max(64) }),
  z.object({ type: z.literal("remove_from_pipeline"), pipelineId: z.string().max(64) }),
]);

export const flowInput = z
  .object({
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(128).describe("Any id unique in this flow, such as msg-1."),
          data: nodeDataInput,
          position: z.object({ x: z.number(), y: z.number() }).optional().describe("Canvas position. Leave out to lay steps out automatically."),
        }),
      )
      .max(MAX_FLOW_NODES),
    edges: z
      .array(
        z.object({
          source: z.string().min(1).max(128),
          target: z.string().min(1).max(128),
          sourceHandle: z
            .string()
            .max(64)
            .optional()
            .describe('Which exit of the source step: "next" (default), "yes" or "no" (follow check), "handoff" (AI reply), "btn:<i>" (postback button i), "qr:<i>" (quick reply i).'),
          id: z.string().max(128).optional(),
        }),
      )
      .max(MAX_FLOW_NODES * 4),
  })
  .describe("The automation's steps. Call get_automation_guide for the step types and examples.");

export type FlowInput = z.infer<typeof flowInput>;

/** A message as the model wrote it, with the payloads Meta requires filled in. */
export function toOutboundMessage(message: z.infer<typeof messageInput>): OutboundMessage {
  const out: OutboundMessage = {};
  if (message.text !== undefined) out.text = message.text;
  if (message.imageUrl !== undefined) out.imageUrl = message.imageUrl;
  if (message.buttons) {
    out.buttons = message.buttons.map((b) => (b.type === "web_url" ? { type: "web_url", title: b.title, url: b.url } : { type: "postback", title: b.title, payload: b.payload ?? "" }));
  }
  if (message.quickReplies) out.quickReplies = message.quickReplies.map((q) => ({ title: q.title, payload: q.payload ?? "" }));
  return out;
}

function toNodeData(data: z.infer<typeof nodeDataInput>): FlowNodeData {
  if (data.type === "send_message") return { type: "send_message", message: toOutboundMessage(data.message) };
  if (data.type === "ask_question") return { ...data, prompt: toOutboundMessage(data.prompt) };
  return data;
}

const ROW_GAP = 200;
const COLUMN_GAP = 300;

/** Top to bottom by distance from the trigger, siblings side by side. Only fills steps that have no position. */
function layout(nodes: Array<Omit<FlowNode, "position"> & { position: FlowNode["position"] | null }>, edges: FlowEdge[]): FlowNode[] {
  const depth = new Map<string, number>();
  const roots = nodes.filter((n) => n.data.type === "trigger").map((n) => n.id);
  const queue = [...roots];
  for (const id of roots) depth.set(id, 0);
  while (queue.length) {
    const id = queue.shift() as string;
    for (const edge of edges) {
      if (edge.source === id && !depth.has(edge.target)) {
        depth.set(edge.target, (depth.get(id) ?? 0) + 1);
        queue.push(edge.target);
      }
    }
  }
  let deepest = Math.max(0, ...depth.values());
  for (const node of nodes) if (!depth.has(node.id)) depth.set(node.id, ++deepest);

  const rows = new Map<number, string[]>();
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    rows.set(d, [...(rows.get(d) ?? []), node.id]);
  }
  const placed = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of rows) {
    ids.forEach((id, i) => placed.set(id, { x: Math.round((i - (ids.length - 1) / 2) * COLUMN_GAP), y: d * ROW_GAP }));
  }
  return nodes.map((n) => ({ ...n, position: n.position ?? (placed.get(n.id) as { x: number; y: number }) }));
}

/** The model's flow as the builder stores it. Validation happens afterwards, in the automation schema and on activation. */
export function toFlowGraph(input: FlowInput): FlowGraph {
  const nodes: Array<Omit<FlowNode, "position"> & { position: FlowNode["position"] | null }> = input.nodes.map((n) => {
    const data = toNodeData(n.data);
    return { id: n.id, type: data.type, position: n.position ?? null, data };
  });
  const edgeInputs = [...input.edges];

  if (!nodes.some((n) => n.data.type === "trigger")) {
    let triggerId = "trigger";
    for (let i = 2; nodes.some((n) => n.id === triggerId); i++) triggerId = `trigger-${i}`;
    const first = nodes[0];
    nodes.unshift({ id: triggerId, type: "trigger", position: null, data: { type: "trigger" } });
    if (first && !edgeInputs.some((e) => e.source === triggerId)) edgeInputs.unshift({ source: triggerId, target: first.id });
  }

  const usedIds = new Set<string>();
  const edges: FlowEdge[] = edgeInputs.map((e) => {
    const handle = e.sourceHandle?.trim() || "next";
    let id = e.id?.trim() || `edge-${e.source}-${handle}-${e.target}`;
    for (let i = 2; usedIds.has(id); i++) id = `${e.id?.trim() || `edge-${e.source}-${handle}-${e.target}`}-${i}`;
    usedIds.add(id);
    return { id, source: e.source, target: e.target, sourceHandle: handle };
  });

  return { nodes: layout(nodes, edges), edges };
}

export const AUTOMATION_GUIDE = `# Building automations

An automation belongs to one connected account (channelId from list_accounts) and starts on one trigger:
- COMMENT: a comment on a post or reel (Instagram) or on a Page post (Facebook). mediaIds (externalId values from list_posts) limit it to those posts; empty means every post, including future ones.
- DM: an incoming direct message.
- STORY_REPLY: a reply to an Instagram story.

matchMode: CONTAINS (a keyword anywhere, any case), EXACT (the whole word), ANY (every comment or message; keywords are ignored). excludeKeywords stop a match.
For COMMENT, publicReplyEnabled with publicReplies posts one of those short replies under the comment, picked at random.
oncePerContact: when true, a person gets this automation's messages once, even if they comment again.

New automations are drafts. update_automation saves changes, test_automation shows what a sample comment or message would do without sending anything, and set_automation_status ACTIVE turns it on (it lists anything that must be fixed first). Quicker start: list_automation_templates, then create_automation with a templateId.

## Flow

{ "nodes": [{ "id", "data", "position"? }], "edges": [{ "source", "target", "sourceHandle"? }] }

- Exactly one trigger step, { "type": "trigger" }. Leave it out and it is added and connected to the first node.
- Positions are optional; missing ones are laid out top to bottom.
- Every step must be reachable from the trigger, and each exit of a step has at most one edge.
- sourceHandle defaults to "next".

Steps (data.type):
- send_message { message: { text?, buttons?, imageUrl?, quickReplies? } }: needs text or an image. Up to 3 buttons with labels up to 20 characters; with buttons the text is up to 640 characters, otherwise about 1,000. web_url buttons open a link. postback buttons and quick replies branch: edges with sourceHandle "btn:<button index>" or "qr:<reply index>". Exits: next, btn:i, qr:i.
- ask_question { prompt, saveTo, validation?, retryPrompt?, maxRetries? }: asks, waits for the answer and stores it on the contact ("name", "email", "phone" or a custom key such as "order_number"). Quick replies are suggested answers, not branches. Exit: next.
- ai_reply { agentId, instruction?, maxTurns? }: an AI agent (list_ai_agents) talks with the contact for up to maxTurns replies (default 4, at most 12), reading the whole conversation so far; messages sent in quick succession get one reply. instruction is added to the agent's own prompt for this step only. Exits: next (finished or out of turns), handoff (it cannot help, they asked for a person, or the model failed; with no handoff edge it takes next).
- condition_follow { retryPrompt? }: checks whether the contact follows the account. Exits: yes, no.
- delay { seconds }: waits, from 1 second to 7 days. Exit: next.
- add_tag { tag } / remove_tag { tag }: exit next.
- add_to_pipeline { pipelineId, stageId } / move_stage { pipelineId, stageId } / remove_from_pipeline { pipelineId }: ids from list_pipelines. Exit: next.

Text can use {{first_name}}, {{name}}, {{username}} and any saved field such as {{email}}. Add a fallback after a bar: {{first_name|there}}.

Delivery limits to keep in mind: a comment can be answered with one private message, within 7 days of the comment. After the person replies, messages can follow for 24 hours after their latest message.

## Example: comment "price", get a link

{
  "channelId": "<id>",
  "name": "Price list",
  "triggerType": "COMMENT",
  "matchMode": "CONTAINS",
  "keywords": ["price"],
  "publicReplyEnabled": true,
  "publicReplies": ["Sent you a DM", "Check your inbox"],
  "flow": {
    "nodes": [
      { "id": "msg", "data": { "type": "send_message", "message": { "text": "Hi {{first_name|there}}, here is the price list.", "buttons": [{ "type": "web_url", "title": "See prices", "url": "https://example.com/prices" }] } } }
    ],
    "edges": []
  }
}

## Example: followers only, collect an email, then tag

"flow": {
  "nodes": [
    { "id": "trigger", "data": { "type": "trigger" } },
    { "id": "follow", "data": { "type": "condition_follow", "retryPrompt": "Follow us first, then tap below." } },
    { "id": "ask", "data": { "type": "ask_question", "prompt": { "text": "What's your email? We'll send the guide there." }, "saveTo": "email", "validation": "email" } },
    { "id": "thanks", "data": { "type": "send_message", "message": { "text": "Thanks! The guide is on its way to {{email}}." } } },
    { "id": "tag", "data": { "type": "add_tag", "tag": "guide-lead" } }
  ],
  "edges": [
    { "source": "trigger", "target": "follow" },
    { "source": "follow", "target": "ask", "sourceHandle": "yes" },
    { "source": "ask", "target": "thanks" },
    { "source": "thanks", "target": "tag" }
  ]
}
`;
