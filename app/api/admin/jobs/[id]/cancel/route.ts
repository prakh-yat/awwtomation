import { NextResponse } from "next/server";

import { assertSuperAdmin, cancelJob } from "@/lib/services/admin";
import { withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

type Params = { id: string };

/** POST /api/admin/jobs/:id/cancel — PENDING/FAILED → CANCELLED. 409 otherwise. */
export const POST = withUser<Params>(async (_req, user, { params }) => {
  assertSuperAdmin(user);
  const { id } = await params;
  return NextResponse.json({ job: await cancelJob(id, user.id) });
});
