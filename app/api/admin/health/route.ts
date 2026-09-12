import { NextResponse } from "next/server";

import { assertSuperAdmin, getHealth } from "@/lib/services/admin";
import { withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/admin/health — polled by the health page. Never cached. */
export const GET = withUser(async (_req, user) => {
  assertSuperAdmin(user);
  const health = await getHealth();
  return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
});
