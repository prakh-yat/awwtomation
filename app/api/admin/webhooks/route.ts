import { NextResponse } from "next/server";

import { adminWebhooksQuerySchema, assertSuperAdmin, listWebhookEvents } from "@/lib/services/admin";
import { parseQuery, withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/admin/webhooks?processed=true|false&platform=&cursor=&limit= */
export const GET = withUser(async (req, user) => {
  assertSuperAdmin(user);
  const query = parseQuery(req, adminWebhooksQuerySchema);
  return NextResponse.json(await listWebhookEvents(query));
});
