import { NextResponse } from "next/server";

import { cancelSchema, cancelSubscription } from "@/lib/services/billing";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** POST /api/billing/cancel { feedback?, comment?, immediately? } → BillingOverview. Owner only. */
export const POST = withWorkspace(
  async (req, ctx) => {
    const input = await parseBody(req, cancelSchema);
    return NextResponse.json(await cancelSubscription(ctx.organization.id, ctx.user.id, input));
  },
  { minRole: "OWNER" },
);
