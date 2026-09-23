import type { Metadata } from "next";

import { AiStudio } from "@/components/ai/ai-studio";
import { listAgents, listProviders } from "@/lib/services/ai";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI" };

export default async function AiPage() {
  const ctx = await requireWorkspaceContext();
  const [agents, providers] = await Promise.all([listAgents(ctx.workspace.id), listProviders(ctx.workspace.id)]);
  const canManage = ctx.role === "OWNER" || ctx.role === "ADMIN";

  return <AiStudio agents={agents} providers={providers} canManage={canManage} />;
}
