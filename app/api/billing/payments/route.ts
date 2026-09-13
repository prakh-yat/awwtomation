import { NextResponse } from "next/server";

import { listPayments } from "@/lib/services/billing";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/billing/payments → { payments: PaymentRow[] } newest first. Admin+. */
export const GET = withWorkspace(
  async (_req, ctx) => NextResponse.json({ payments: await listPayments(ctx.organization.id) }),
  { minRole: "ADMIN" },
);
