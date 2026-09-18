import type { WindowState } from "@/lib/services/inbox";

/**
 * Client-side mirror of `windowState()` in lib/services/inbox.ts so the badge
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

export const WINDOW_RULE_EXPLANATION =
  "Instagram and Facebook let a business message someone for 24 hours after their last message. After that, a person on your team can still reply for up to 7 days. Past 7 days you have to wait for them to message again.";
