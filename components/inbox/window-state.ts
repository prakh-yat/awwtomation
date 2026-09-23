import type { WindowState } from "@/lib/services/inbox";

/**
 * Client-side mirror of `windowState()` in lib/services/inbox.ts so the pill
 * and composer can flip the moment a window expires instead of waiting for
 * the next poll. The constants intentionally match lib/automation/send.ts
 * (which can't be imported here: it pulls in Prisma).
 */
export const STANDARD_WINDOW_MS = 24 * 3600 * 1000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 3600 * 1000;

export function computeWindowState(lastInboundAt: string | null, now = Date.now()): WindowState {
  if (!lastInboundAt) return { open: false, kind: "closed", expiresAt: null };
  const last = new Date(lastInboundAt).getTime();
  if (now - last < STANDARD_WINDOW_MS) {
    return { open: true, kind: "standard", expiresAt: new Date(last + STANDARD_WINDOW_MS).toISOString() };
  }
  if (now - last < HUMAN_AGENT_WINDOW_MS) {
    return { open: true, kind: "human_agent", expiresAt: new Date(last + HUMAN_AGENT_WINDOW_MS).toISOString() };
  }
  return { open: false, kind: "closed", expiresAt: null };
}

/**
 * When a person on the team can no longer reply. Both stages of the window
 * run from the contact's last message, so this is the same moment in either
 * stage: the first 24 hours only decide whether automations may still send,
 * and the composer sends as a person after that.
 */
export function teamReplyDeadline(window: WindowState): string | null {
  if (!window.open || !window.expiresAt) return null;
  if (window.kind === "human_agent") return window.expiresAt;
  return new Date(new Date(window.expiresAt).getTime() - STANDARD_WINDOW_MS + HUMAN_AGENT_WINDOW_MS).toISOString();
}
