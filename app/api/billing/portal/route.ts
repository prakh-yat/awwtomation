import { NextResponse } from "next/server";

import { customerPortalUrl } from "@/lib/services/billing";
import { withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** POST /api/billing/portal → { url } — Dodo customer portal (payment methods, invoices). Owner only. */
export const POST = withWorkspace(
  async (_req, ctx) => NextResponse.json({ url: await customerPortalUrl(ctx.workspace.id) }),
  { minRole: "OWNER" },
);
