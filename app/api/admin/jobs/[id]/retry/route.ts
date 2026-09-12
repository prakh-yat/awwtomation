import { NextResponse } from "next/server";

import { assertSuperAdmin, retryJob } from "@/lib/services/admin";
import { withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** POST /api/admin/jobs/:id/retry — FAILED/CANCELLED → PENDING with a fresh attempt budget. 409 otherwise. */
export const POST = withUser<Params>(async (_req, user, { params }) => {
  assertSuperAdmin(user);
  const { id } = await params;
  return NextResponse.json({ job: await retryJob(id, user.id) });
});
