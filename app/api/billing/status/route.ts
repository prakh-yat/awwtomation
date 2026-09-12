import { NextResponse } from "next/server";

import { getBillingOverview } from "@/lib/services/billing";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/billing/status → BillingOverview for the active workspace. Admin+. */
export const GET = withWorkspace(
  async (_req, ctx) => NextResponse.json(await getBillingOverview(ctx.workspace.id)),
  { minRole: "ADMIN" },
);
