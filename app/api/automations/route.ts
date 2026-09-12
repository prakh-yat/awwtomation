import { AutomationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { automationCreateSchema, createAutomation, listAutomations } from "@/lib/services/automations";
import { parseBody, parseQuery, withWorkspace } from "@/lib/workspace/api";

export const runtime = "nodejs";

const listQuerySchema = z.object({
  channelId: z.string().max(64).optional(),
  status: z.nativeEnum(AutomationStatus).optional(),
  q: z.string().max(100).optional(),
});

/** GET /api/automations?channelId=&status=&q= → { automations: AutomationListItem[] } */
export const GET = withWorkspace(async (req, ctx) => {
  const filters = parseQuery(req, listQuerySchema);
  const automations = await listAutomations(ctx.workspace.id, {
    channelId: filters.channelId || undefined,
    status: filters.status,
    q: filters.q || undefined,
  });
  return NextResponse.json({ automations });
});

/** POST /api/automations { channelId, templateId?, name?, ...overrides } → { automation: AutomationDetail } (201) */
export const POST = withWorkspace(async (req, ctx) => {
  const body = await parseBody(req, automationCreateSchema);
  const automation = await createAutomation(ctx.workspace.id, body, ctx.user.id);
  return NextResponse.json({ automation }, { status: 201 });
});
