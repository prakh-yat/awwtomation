import { NextResponse } from "next/server";
import { z } from "zod";

import { transferOwnership } from "@/lib/services/workspaces";
import { parseBody, withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

const transferSchema = z.object({ userId: z.string().min(1).max(64) });

/** OWNER only: hand the workspace to another member; caller becomes ADMIN. */
export const POST = withUser<Params>(async (req, user, { params }) => {
  const { id } = await params;
  const { userId } = await parseBody(req, transferSchema);
  await transferOwnership(id, user.id, userId);
  return NextResponse.json({ ok: true });
});
