/**
 * The template registry.
 *
 * The gallery lists these and `createAutomation` instantiates one (substituting
 * the channel handle). Every template is checked with `flowGraphSchema` +
 * `validateFlow` at module load, so a broken template fails loudly at boot
 * instead of producing an automation that can never be activated.
 */
import type { TriggerType } from "@prisma/client";

import {
  askQuestionFieldLabel,
  findTriggerNode,
  flowGraphSchema,
  nextNodeId,
  validateFlow,
  type FlowGraph,
  type FlowNodeData,
} from "@/lib/automation/flow-types";

import { INSTAGRAM_TEMPLATES } from "./instagram";
import { ACCOUNT_PLACEHOLDER, triggerLabel, type AutomationTemplate, type TemplatePlatform, type TemplateStep, type TemplateSummary } from "./kit";
import { MESSENGER_TEMPLATES } from "./messenger";

export { TEMPLATE_GOALS, triggerLabel, triggerLabelsFor } from "./kit";
export type { AutomationTemplate, TemplateGoal, TemplatePlatform, TemplateStep, TemplateSummary } from "./kit";

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [...INSTAGRAM_TEMPLATES, ...MESSENGER_TEMPLATES];

// Fail fast: a template that cannot be activated is a bug, not user data.
const seenIds = new Set<string>();
for (const template of AUTOMATION_TEMPLATES) {
  if (seenIds.has(template.id)) throw new Error(`Two templates share the id "${template.id}".`);
  seenIds.add(template.id);

  const parsed = flowGraphSchema.safeParse(template.flow);
  if (!parsed.success) {
    throw new Error(`Template "${template.id}" has an invalid flow shape: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const result = validateFlow(template.flow);
  if (!result.ok) {
    throw new Error(`Template "${template.id}" fails validateFlow: ${result.errors.join("; ")}`);
  }
  if (template.platform === "MESSENGER" && template.triggerType === "STORY_REPLY") {
    throw new Error(`Template "${template.id}" uses a story reply trigger, which a Facebook Page does not have.`);
  }
  if (template.matchMode !== "ANY" && template.keywords.length === 0) {
    throw new Error(`Template "${template.id}" matches on keywords but lists none.`);
  }
}

// ───────────────────────── Helpers ─────────────────────────

export function getTemplate(id: string): AutomationTemplate | null {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Which platform a connected channel draws its templates from. */
export function platformForChannel(platform: "INSTAGRAM" | "FACEBOOK"): TemplatePlatform {
  return platform === "INSTAGRAM" ? "INSTAGRAM" : "MESSENGER";
}

function formatDelay(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

const SHORT_TRIGGER_LABELS: Record<TriggerType, string> = { COMMENT: "Comment", DM: "DM", STORY_REPLY: "Story reply" };

/** Short label for the step chain on a card, where there is no room for the full trigger name. */
export function shortTriggerLabel(trigger: TriggerType): string {
  return SHORT_TRIGGER_LABELS[trigger];
}

export function stepLabel(data: FlowNodeData, triggerType: TriggerType): string {
  switch (data.type) {
    case "trigger":
      return shortTriggerLabel(triggerType);
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
      return `Remove tag "${data.tag}"`;
    case "add_to_pipeline":
      return "Add to pipeline";
    case "move_stage":
      return "Move stage";
    case "remove_from_pipeline":
      return "Remove from pipeline";
  }
}

/**
 * Linearised walk of the happy path (next / yes / first button) for gallery
 * cards. Branches are not shown; the builder canvas does that.
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
  return {
    ...rest,
    steps: summarizeFlow(flow, template.triggerType),
    triggerLabel: triggerLabel(template.triggerType, template.platform),
  };
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
