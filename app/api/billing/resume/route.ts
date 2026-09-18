import { NextResponse } from "next/server";

import { resumeSubscription } from "@/lib/services/billing";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** POST /api/billing/resume → BillingOverview: undoes a scheduled cancellation. Owner only. */
export const POST = withWorkspace(
  async (_req, ctx) => NextResponse.json(await resumeSubscription(ctx.organization.id, ctx.user.id)),
  { minRole: "OWNER" },
);
