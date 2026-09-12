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

const STEP_Y = 170;
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
  description: "Someone comments a keyword on your post and instantly gets the link in their DMs.",
  category: "Links",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["link"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a DM 📩", "Check your inbox 👀", "Just sent it over!"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hey {{first_name|there}}! Thanks for commenting — here's the link you asked for 👇",
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
  description: "Only followers get the link. Non-followers are asked to follow first, then tap to check again.",
  category: "Growth",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["link", "send"],
  followGate: true,
  publicReplyEnabled: true,
  publicReplies: ["Check your DMs 📩", "Sent! Look in your inbox 👀"],
  flow: {
    nodes: [
      TRIGGER,
      node("follow-1", 0, STEP_Y, {
        type: "condition_follow",
        retryPrompt: `Follow ${ACCOUNT_PLACEHOLDER} then tap the button below to get your link 👇`,
      }),
      node("message-link", -BRANCH_X, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "You're following — thank you! Here's your link 👇",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        },
      }),
      node("message-follow", BRANCH_X, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: `Almost there! Follow ${ACCOUNT_PLACEHOLDER} then tap below and I'll send the link right away.`,
          // The payload is preserved by the engine; tapping it re-runs the follow check.
          buttons: [{ type: "postback", title: "I'm following ✓", payload: "follow_check:follow-1" }],
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
  name: "Lead magnet + tag",
  description: "Tag the contact as a lead, confirm with a button tap, then deliver the freebie.",
  category: "Leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["guide", "free"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent it to your DMs 📩"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "lead" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}! Want the free guide? Tap below and I'll send it straight away.",
          buttons: [{ type: "postback", title: "Send it to me", payload: "btn:0" }],
        },
      }),
      node("message-2", 0, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "Here you go — enjoy! Reply here any time if you have questions.",
          buttons: [{ type: "web_url", title: "Download the guide", url: "https://example.com/guide" }],
        },
      }),
    ],
    edges: [edge("trigger", "tag-1"), edge("tag-1", "message-1"), edge("message-1", "message-2", "btn:0")],
  },
};

const storyReplyLink: AutomationTemplate = {
  id: "story-reply-link",
  name: "Story reply → link",
  description: "When someone replies to your story with a keyword, send them the link automatically.",
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
          text: "Thanks for replying to my story! Here's the link 👇",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        },
      }),
    ],
    edges: [edge("trigger", "message-1")],
  },
};

const dmAutoresponder: AutomationTemplate = {
  id: "dm-keyword-autoresponder",
  name: "DM keyword autoresponder",
  description: "Answer common DM questions instantly with a message and quick links.",
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
          text: "Hey {{first_name|there}}! This is an automated reply — here's everything about pricing. A human will follow up if you have more questions.",
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
  description: "Every comment counts as an entry: tag the contact and confirm their entry by DM.",
  category: "Engagement",
  triggerType: "COMMENT",
  matchMode: "ANY",
  keywords: [],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["You're in! 🎉", "Entry received — good luck! 🍀"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "giveaway" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "You're entered in the giveaway, {{first_name|friend}}! 🎉 We'll announce the winner here — keep an eye on your inbox.",
        },
      }),
    ],
    edges: [edge("trigger", "tag-1"), edge("tag-1", "message-1")],
  },
};

const leadCaptureEmail: AutomationTemplate = {
  id: "lead-capture-email",
  name: "Lead capture (ask for email)",
  description: "Offer something valuable, ask for their email, tag them as a lead and confirm — all inside the DM.",
  category: "Leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["guide", "free", "send"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a DM 📩", "Check your inbox 👀"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hey {{first_name|there}}! I've got the free guide ready for you. Tap below and I'll send it to your inbox 👇",
          // Tapping the button opens the 24h window so the question can go out as a normal message.
          buttons: [{ type: "postback", title: "Get it", payload: "btn:0" }],
        },
      }),
      node("ask-email", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: { text: "What's the best email to send it to?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "Hmm, that doesn't look like an email address. Could you type it again?",
        maxRetries: 2,
      }),
      node("tag-lead", 0, STEP_Y * 3, { type: "add_tag", tag: "lead" }),
      node("message-2", 0, STEP_Y * 4, {
        type: "send_message",
        message: { text: "Thanks! Check your inbox — it's on its way to {{email|you}} ✉️" },
      }),
    ],
    edges: [edge("trigger", "message-1"), edge("message-1", "ask-email", "btn:0"), edge("ask-email", "tag-lead"), edge("tag-lead", "message-2")],
  },
};

const quizPoll: AutomationTemplate = {
  id: "quiz-poll",
  name: "Quiz / poll",
  description: "Ask a one-tap question in the DM, store the answer on the contact and tag everyone who voted.",
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
          text: "Quick poll, {{first_name|friend}}: which topic should I cover next?",
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
      node("tag-done", 0, STEP_Y * 2, { type: "add_tag", tag: "quiz_done" }),
      node("message-thanks", 0, STEP_Y * 3, {
        type: "send_message",
        message: { text: "Got it — {{answer|noted}}! Thanks for voting, I'll share the results soon 🙌" },
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
      return `Tag "${data.tag}"`;
    case "remove_tag":
      return `Untag "${data.tag}"`;
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
