import { NextResponse } from "next/server";

import { adminJobsQuerySchema, assertSuperAdmin, listJobs } from "@/lib/services/admin";
import { parseQuery, withUser } from "@/lib/workspace/api";

export const runtime = "nodejs";

/** GET /api/admin/jobs?status=&type=&cursor=&limit= — polled by the jobs page every 10s. */
export const GET = withUser(async (req, user) => {
  assertSuperAdmin(user);
  const query = parseQuery(req, adminJobsQuerySchema);
  return NextResponse.json(await listJobs(query));
});
