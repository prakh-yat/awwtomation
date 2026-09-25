import { NextResponse } from "next/server";

import { withStepInstruction } from "@/lib/ai/agent";
import { assertPlaygroundAllowed, playgroundSchema, requireAgent, runAgent } from "@/lib/services/ai";
import { listChannelOptions } from "@/lib/services/automations";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/ai/playground { agentId, messages, instruction? } -> { reply, handoff, done } or { error }.
 *
 * The same call the automation makes, so what you read here is what a contact
 * would get. The reply is not sent to anyone. On a workspace's own key every
 * test costs them; on the built-in model it costs us, so it is rate limited.
 */
export const POST = withWorkspace(async (req, ctx) => {
  const { agentId, messages, instruction } = await parseBody(req, playgroundSchema);
  const agent = await requireAgent(ctx.workspace.id, agentId);
  await assertPlaygroundAllowed(ctx.workspace.id, agent);

  const channels = await listChannelOptions(ctx.workspace.id);
  const channel = channels.find((c) => c.status === "ACTIVE") ?? channels[0];

  const outcome = await runAgent({
    workspaceId: ctx.workspace.id,
    agent: withStepInstruction(agent, instruction),
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
