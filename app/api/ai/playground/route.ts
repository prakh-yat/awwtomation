import { NextResponse } from "next/server";

import { playgroundSchema, requireAgent, runAgent } from "@/lib/services/ai";
import { listChannelOptions } from "@/lib/services/automations";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/ai/playground { agentId, messages } -> { reply, handoff, done } or { error }.
 *
 * The same call the automation makes, so what you read here is what a contact
 * would get. It runs against the workspace's own key, so every test costs them
 * and nothing else; the reply is not sent to anyone.
 */
export const POST = withWorkspace(async (req, ctx) => {
  const { agentId, messages } = await parseBody(req, playgroundSchema);
  const agent = await requireAgent(ctx.workspace.id, agentId);

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

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message, reason: outcome.reason, fallback: outcome.fallback }, { status: 502 });
  }
  return NextResponse.json({ reply: outcome.text, buttons: outcome.buttons, handoff: outcome.handoff, done: outcome.done });
});
