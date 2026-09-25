import { NextResponse } from "next/server";

import { channelSetupSchema, saveChannelSetup, toChannelView } from "@/lib/services/channels";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * PATCH /api/channels/[id]/setup { answers?: { account_type?, monetization?, goals? }, complete? } → { channel }
 * The questions asked right after an account is connected, also reopened from
 * the account's "Edit details". Answers left out keep their saved value;
 * `complete: true` stops them being asked again. ADMIN+, like connecting.
 */
export const PATCH = withWorkspace<Params>(
  async (req, ctx, { params }) => {
    const { id } = await params;
    const input = await parseBody(req, channelSetupSchema);
    const channel = await saveChannelSetup(ctx.workspace.id, id, input);
    return NextResponse.json({ channel: toChannelView(channel) });
  },
  { minRole: "ADMIN" },
);
