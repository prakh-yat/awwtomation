/**
 * Shared vocabulary for the template library.
 *
 * Templates are plain data: a trigger, a keyword list and a flow graph. The
 * gallery groups them the way people actually shop for automations (by the
 * channel they run on, by what they are trying to achieve, and by what sets
 * them off), so those three facets are part of the template itself rather than
 * something the UI has to infer.
 */
import type { MatchMode, TriggerType } from "@prisma/client";

import type { FlowEdge, FlowGraph, FlowNode, FlowNodeData, FlowNodeType } from "@/lib/automation/flow-types";

/** Which connected account a template is written for. */
export type TemplatePlatform = "INSTAGRAM" | "MESSENGER";

/** The "By goal" filters in the gallery, in the order they are listed. */
export const TEMPLATE_GOALS = [
  "Grow your followers",
  "Engage your audience",
  "Drive traffic",
  "Capture leads",
  "Sell more",
] as const;
export type TemplateGoal = (typeof TEMPLATE_GOALS)[number];

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  platform: TemplatePlatform;
  goal: TemplateGoal;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  flow: FlowGraph;
  publicReplyEnabled: boolean;
  publicReplies: string[];
  /** Whether the flow contains a follow gate (shown as a badge in the gallery). */
  followGate: boolean;
  /** Surfaced under "Recommended" and marked with a badge. */
  popular?: boolean;
};

export type TemplateStep = { type: FlowNodeType; label: string };

/** Client-safe shape for the gallery: the flow is replaced by a linear step summary. */
export type TemplateSummary = Omit<AutomationTemplate, "flow"> & {
  steps: TemplateStep[];
  /** Human label for `triggerType` on this platform, matching the "By trigger" filter. */
  triggerLabel: string;
};

/** The "By trigger" filters. Instagram and Messenger name the same trigger differently. */
export function triggerLabel(triggerType: TriggerType, platform: TemplatePlatform): string {
  if (triggerType === "DM") return platform === "INSTAGRAM" ? "DM" : "Message";
  if (triggerType === "STORY_REPLY") return "Story reply";
  return platform === "INSTAGRAM" ? "Post or Reel comment" : "Post comment";
}

export function triggerLabelsFor(platform: TemplatePlatform): string[] {
  const seen = new Set<string>();
  for (const type of ["COMMENT", "DM", "STORY_REPLY"] as const) {
    const label = triggerLabel(type, platform);
    if (label) seen.add(label);
  }
  return [...seen];
}

// ───────────────────────── Graph builders ─────────────────────────

/** Vertical gap between two steps on the canvas, and the horizontal offset for a branch. */
export const STEP_Y = 220;
export const BRANCH_X = 220;

export function node(id: string, x: number, y: number, data: FlowNodeData): FlowNode {
  return { id, type: data.type, position: { x, y }, data };
}

export function edge(source: string, target: string, sourceHandle = "next"): FlowEdge {
  return { id: `e-${source}-${sourceHandle}-${target}`, source, target, sourceHandle };
}

export const TRIGGER = node("trigger", 0, 0, { type: "trigger" });

/**
 * `{{account}}` is a template-only placeholder for the connected account's
 * handle; it is replaced when the template is instantiated for a channel
 * (the runtime renderer only knows {{username}}, {{name}}, {{first_name}}).
 */
export const ACCOUNT_PLACEHOLDER = "{{account}}";

/**
 * Template-only placeholder for an AI agent. Replaced with the workspace's
 * default agent when the template is instantiated, or with an empty string when
 * there is none, so the builder asks for one instead of the automation silently
 * pointing at nothing.
 */
export const AGENT_PLACEHOLDER = "{{agent}}";

/** A straight line of steps: trigger to the first node, then one after another. */
export function chain(...ids: string[]): FlowEdge[] {
  const edges: FlowEdge[] = [];
  for (let i = 0; i < ids.length - 1; i += 1) edges.push(edge(ids[i], ids[i + 1]));
  return edges;
}

/** Placeholder links. Every template ships with something valid the user then edits. */
export const LINK = {
  site: "https://example.com",
  guide: "https://example.com/guide",
  shop: "https://example.com/shop",
  pricing: "https://example.com/pricing",
  booking: "https://example.com/book",
  course: "https://example.com/course",
  youtube: "https://youtube.com/@example",
  whatsapp: "https://wa.me/15551234567",
  rsvp: "https://example.com/rsvp",
} as const;
