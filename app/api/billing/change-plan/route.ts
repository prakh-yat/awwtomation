import { NextResponse } from "next/server";

import { changePlan, changePlanSchema } from "@/lib/services/billing";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** POST /api/billing/change-plan { tier, interval } → BillingOverview (402 PAYMENT_FAILED if the upgrade charge fails). Owner only. */
export const POST = withWorkspace(
  async (req, ctx) => {
    const { tier, interval } = await parseBody(req, changePlanSchema);
    return NextResponse.json(await changePlan(ctx.workspace.id, ctx.user.id, tier, interval));
  },
  { minRole: "OWNER" },
);
