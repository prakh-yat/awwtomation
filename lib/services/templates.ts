/**
 * Static automation templates. The "new automation" gallery lists them and
 * `createAutomation` instantiates one (substituting the channel handle).
 *
 * Every template is checked with `flowGraphSchema` + `validateFlow` at module
 * load so a broken template fails loudly in dev instead of producing an
 * automation that can never be activated.
 */
import type { MatchMode, TriggerType } from "@prisma/client";
import {
  askQuestionFieldLabel,
  findTriggerNode,
  flowGraphSchema,
  nextNodeId,
  validateFlow,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeType,
} from "@/lib/automation/flow-types";

// ───────────────────────── Types ─────────────────────────

export type TemplateCategory = "Links" | "Growth" | "Leads" | "Stories" | "DMs" | "Engagement";

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  flow: FlowGraph;
  publicReplyEnabled: boolean;
  publicReplies: string[];
  /** Whether the flow contains a follow gate (shown as a badge in the gallery). */
  followGate: boolean;
};

export type TemplateStep = { type: FlowNodeType; label: string };

/** Client-safe shape for the gallery: the flow is replaced by a linear step summary. */
export type TemplateSummary = Omit<AutomationTemplate, "flow"> & { steps: TemplateStep[] };

// ───────────────────────── Builders ─────────────────────────

const STEP_Y = 220;
const BRANCH_X = 220;

function node(id: string, x: number, y: number, data: FlowNodeData): FlowNode {
  return { id, type: data.type, position: { x, y }, data };
}

function edge(source: string, target: string, sourceHandle = "next"): FlowEdge {
  return { id: `e-${source}-${sourceHandle}-${target}`, source, target, sourceHandle };
}

const TRIGGER = node("trigger", 0, 0, { type: "trigger" });

/**
 * `{{account}}` is a template-only placeholder for the connected account's
 * handle; it is replaced when the template is instantiated for a channel
 * (the runtime renderer only knows {{username}}, {{name}}, {{first_name}}).
 */
const ACCOUNT_PLACEHOLDER = "{{account}}";

// ───────────────────────── Templates ─────────────────────────

const linkInDm: AutomationTemplate = {
  id: "link-in-dm",
  name: "Link in DM",
  description: "When someone comments a keyword, send them the link in a DM.",
  category: "Links",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["link"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a DM", "Check your messages", "Just sent it over"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, thanks for your comment. Here's the link you asked for.",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        },
      }),
    ],
    edges: [edge("trigger", "message-1")],
  },
};

const followToUnlock: AutomationTemplate = {
  id: "follow-to-unlock",
  name: "Follow to unlock",
  description: "Send the link to followers. Everyone else is asked to follow first, then taps a button to try again.",
  category: "Growth",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["link", "send"],
  followGate: true,
  publicReplyEnabled: true,
  publicReplies: ["Check your DMs", "Sent, have a look in your messages"],
  flow: {
    nodes: [
      TRIGGER,
      node("follow-1", 0, STEP_Y, {
        type: "condition_follow",
        retryPrompt: `Follow ${ACCOUNT_PLACEHOLDER}, then tap the button below to get your link.`,
      }),
      node("message-link", -BRANCH_X, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Thanks for following. Here's your link.",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        },
      }),
      node("message-follow", BRANCH_X, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: `Almost there. Follow ${ACCOUNT_PLACEHOLDER}, then tap below and the link is yours.`,
          // The payload is preserved by the engine; tapping it re-runs the follow check.
          buttons: [{ type: "postback", title: "I'm following", payload: "follow_check:follow-1" }],
        },
      }),
    ],
    edges: [
      edge("trigger", "follow-1"),
      edge("follow-1", "message-link", "yes"),
      edge("follow-1", "message-follow", "no"),
      // Visual loop back to the gate — execution follows the follow_check payload, not this edge.
      edge("message-follow", "follow-1", "btn:0"),
    ],
  },
};

const leadMagnet: AutomationTemplate = {
  id: "lead-magnet-tag",
  name: "Free guide",
  description: "Tag the person as a lead, then send your free guide when they tap a button.",
  category: "Leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["guide", "free"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent it to your DMs"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "lead" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, want the free guide? Tap below and I'll send it now.",
          buttons: [{ type: "postback", title: "Send it to me", payload: "btn:0" }],
        },
      }),
      node("message-2", 0, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "Here it is. Reply here if you have any questions.",
          buttons: [{ type: "web_url", title: "Download the guide", url: "https://example.com/guide" }],
        },
      }),
    ],
    edges: [edge("trigger", "tag-1"), edge("tag-1", "message-1"), edge("message-1", "message-2", "btn:0")],
  },
};

const storyReplyLink: AutomationTemplate = {
  id: "story-reply-link",
  name: "Story reply link",
  description: "When someone replies to your story with a keyword, send them the link.",
  category: "Stories",
  triggerType: "STORY_REPLY",
  matchMode: "CONTAINS",
  keywords: ["link", "yes"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Thanks for replying to the story. Here's the link.",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        },
      }),
    ],
    edges: [edge("trigger", "message-1")],
  },
};

const dmAutoresponder: AutomationTemplate = {
  id: "dm-keyword-autoresponder",
  name: "Answer price questions",
  description: "When a DM asks about price, reply with your price list and a way to get in touch.",
  category: "DMs",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["price", "pricing", "how much"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, here are our prices. Someone from the team will reply if you have more questions.",
          buttons: [
            { type: "web_url", title: "See pricing", url: "https://example.com/pricing" },
            { type: "web_url", title: "Book a call", url: "https://example.com/book" },
          ],
        },
      }),
    ],
    edges: [edge("trigger", "message-1")],
  },
};

const giveaway: AutomationTemplate = {
  id: "giveaway-entry",
  name: "Giveaway entry",
  description: "Every comment is an entry. Tag the person and confirm their entry by DM.",
  category: "Engagement",
  triggerType: "COMMENT",
  matchMode: "ANY",
  keywords: [],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["You're in", "Entry received, good luck"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "giveaway" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "You're entered in the giveaway, {{first_name|there}}. We'll announce the winner on our page, so keep an eye out.",
        },
      }),
    ],
    edges: [edge("trigger", "tag-1"), edge("tag-1", "message-1")],
  },
};

const leadCaptureEmail: AutomationTemplate = {
  id: "lead-capture-email",
  name: "Collect emails",
  description: "Ask for an email address in the DM, save it on the contact and tag them as a lead.",
  category: "Leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["guide", "free", "send"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a DM", "Check your messages"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, the free guide is ready. Tap below and I'll email it to you.",
          // Tapping the button opens the 24h window so the question can go out as a normal message.
          buttons: [{ type: "postback", title: "Get it", payload: "btn:0" }],
        },
      }),
      node("ask-email", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: { text: "What email should I send it to?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That doesn't look like an email address. Could you type it again?",
        maxRetries: 2,
      }),
      node("tag-lead", 0, STEP_Y * 3, { type: "add_tag", tag: "lead" }),
      node("message-2", 0, STEP_Y * 4, {
        type: "send_message",
        message: { text: "Thanks. It's on its way to {{email|your inbox}}." },
      }),
    ],
    edges: [edge("trigger", "message-1"), edge("message-1", "ask-email", "btn:0"), edge("ask-email", "tag-lead"), edge("tag-lead", "message-2")],
  },
};

const quizPoll: AutomationTemplate = {
  id: "quiz-poll",
  name: "Quick poll",
  description: "Ask a one-tap question, save the answer on the contact and tag everyone who voted.",
  category: "Engagement",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["quiz", "poll", "vote"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-answer", 0, STEP_Y, {
        type: "ask_question",
        prompt: {
          text: "Quick poll, {{first_name|there}}: which topic should we cover next?",
          quickReplies: [
            { title: "Growth", payload: "qr:0" },
            { title: "Content", payload: "qr:1" },
            { title: "Sales", payload: "qr:2" },
          ],
        },
        saveTo: "answer",
        validation: "none",
        maxRetries: 1,
      }),
      node("tag-done", 0, STEP_Y * 2, { type: "add_tag", tag: "voted" }),
      node("message-thanks", 0, STEP_Y * 3, {
        type: "send_message",
        message: { text: "Thanks for voting. We'll share the results soon." },
      }),
    ],
    edges: [edge("trigger", "ask-answer"), edge("ask-answer", "tag-done"), edge("tag-done", "message-thanks")],
  },
};

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  linkInDm,
  followToUnlock,
  leadMagnet,
  leadCaptureEmail,
  storyReplyLink,
  dmAutoresponder,
  giveaway,
  quizPoll,
];

// Fail fast: a template that can't be activated is a bug, not user data.
for (const template of AUTOMATION_TEMPLATES) {
  const parsed = flowGraphSchema.safeParse(template.flow);
  if (!parsed.success) {
    throw new Error(`Template "${template.id}" has an invalid flow shape: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const result = validateFlow(template.flow);
  if (!result.ok) {
    throw new Error(`Template "${template.id}" fails validateFlow: ${result.errors.join("; ")}`);
  }
}

// ───────────────────────── Helpers ─────────────────────────

export function getTemplate(id: string): AutomationTemplate | null {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id) ?? null;
}

function formatDelay(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

const TRIGGER_LABELS: Record<TriggerType, string> = { COMMENT: "Comment", DM: "DM", STORY_REPLY: "Story reply" };

export function triggerLabel(trigger: TriggerType): string {
  return TRIGGER_LABELS[trigger];
}

export function stepLabel(data: FlowNodeData, triggerType: TriggerType): string {
  switch (data.type) {
    case "trigger":
      return triggerLabel(triggerType);
    case "send_message":
      return "Message";
    case "ask_question":
      return `Ask for ${askQuestionFieldLabel(data.saveTo).toLowerCase()}`;
    case "condition_follow":
      return "Follow gate";
    case "delay":
      return `Wait ${formatDelay(data.seconds)}`;
    case "add_tag":
      return `Tag “${data.tag}”`;
    case "remove_tag":
      return `Remove tag “${data.tag}”`;
    case "add_to_pipeline":
      return "Add to pipeline";
    case "move_stage":
      return "Move stage";
    case "remove_from_pipeline":
      return "Remove from pipeline";
  }
}

/**
 * Linearised walk of the "happy path" (next / yes / first button) for
 * gallery cards. Branches are not shown — the builder canvas does that.
 */
export function summarizeFlow(flow: FlowGraph, triggerType: TriggerType, max = 6): TemplateStep[] {
  const steps: TemplateStep[] = [];
  const seen = new Set<string>();
  let current = findTriggerNode(flow)?.id ?? null;
  while (current && !seen.has(current) && steps.length < max) {
    seen.add(current);
    const found = flow.nodes.find((n) => n.id === current);
    if (!found) break;
    steps.push({ type: found.type, label: stepLabel(found.data, triggerType) });
    current =
      nextNodeId(flow, found.id, "next") ??
      nextNodeId(flow, found.id, "yes") ??
      nextNodeId(flow, found.id, "btn:0") ??
      nextNodeId(flow, found.id, "qr:0");
  }
  return steps;
}

export function summarizeTemplate(template: AutomationTemplate): TemplateSummary {
  const { flow, ...rest } = template;
  return { ...rest, steps: summarizeFlow(flow, template.triggerType) };
}

export function listTemplateSummaries(): TemplateSummary[] {
  return AUTOMATION_TEMPLATES.map(summarizeTemplate);
}

/**
 * Replace `{{account}}` with the channel's handle everywhere in the flow.
 * Done on the JSON string so nested message/button/prompt fields are all
 * covered without a hand-written deep walk; the handle is JSON-escaped first.
 */
export function instantiateTemplate(template: AutomationTemplate, opts: { accountHandle: string }): AutomationTemplate {
  const escaped = JSON.stringify(opts.accountHandle).slice(1, -1);
  const json = JSON.stringify(template.flow).split(ACCOUNT_PLACEHOLDER).join(escaped);
  const flow = flowGraphSchema.parse(JSON.parse(json));
  return { ...template, flow };
}
