import { NextResponse } from "next/server";

import { reconcileCheckoutSession, reconcileSchema } from "@/lib/services/billing";
import { parseBody, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/**
 * POST /api/billing/reconcile { sessionId?, paymentId?, subscriptionId? } → BillingOverview.
 * Pulls the subscription state from Dodo (the success-page poller and a manual
 * "refresh" use this when a webhook is late). Admin+ — it only syncs, never changes anything at the provider.
 */
export const POST = withWorkspace(
  async (req, ctx) => {
    const ids = await parseBody(req, reconcileSchema);
    return NextResponse.json(await reconcileCheckoutSession(ctx.organization.id, ids));
  },
  { minRole: "ADMIN" },
);
