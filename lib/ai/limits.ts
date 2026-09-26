/**
 * How much an agent may hold. The editor counts against these and will not
 * save past them, the API and MCP tools refuse anything over them, and a reply
 * is written within them, so an agent is never bigger in a DM than it looks on
 * the page.
 *
 * Client-safe: plain numbers, no imports.
 */

/** Characters each writing area may hold. */
export const AGENT_TEXT_LIMITS = {
  name: 60,
  systemPrompt: 1000,
  knowledge: 2000,
  guardrails: 1000,
  fallbackReply: 500,
} as const;

export type NumberLimit = { min: number; max: number; default: number };

/** The longest reply, in tokens. A new agent starts at half the most. */
export const REPLY_TOKENS: NumberLimit = { min: 60, max: 400, default: 200 };

/** How many recent messages of the conversation an agent reads. A new agent starts at half the most. */
export const CONTEXT_MESSAGES: NumberLimit = { min: 2, max: 20, default: 10 };

/** `value` held inside a limit, for settings saved before the limit existed. */
export function clampTo(limit: NumberLimit, value: number): number {
  return Math.min(limit.max, Math.max(limit.min, Math.round(value)));
}
