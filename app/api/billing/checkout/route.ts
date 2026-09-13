import { NextResponse } from "next/server";

import { checkoutSchema, startCheckout } from "@/lib/services/billing";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** POST /api/billing/checkout { tier, interval, billing? } → { checkoutUrl, sessionId, mode }. Owner only. */
export const POST = withWorkspace(
  async (req, ctx) => {
    const body = await parseBody(req, checkoutSchema);
    const result = await startCheckout({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      tier: body.tier,
      interval: body.interval,
      billing: body.billing,
    });
    return NextResponse.json(result);
  },
  { minRole: "OWNER" },
);
