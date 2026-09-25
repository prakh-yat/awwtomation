import type { Metadata } from "next";

import { AiStudio } from "@/components/ai/ai-studio";
import { builtInModel } from "@/lib/ai/builtin";
import { listAgents, listProviders } from "@/lib/services/ai";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI" };

/** `?agent=<id>` opens that agent, as the automation builder's "Edit agent" link does. */
export default async function AiPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const ctx = await requireWorkspaceContext();
  const [agents, providers, { agent }] = await Promise.all([listAgents(ctx.workspace.id), listProviders(ctx.workspace.id), searchParams]);
  const canManage = ctx.role === "OWNER" || ctx.role === "ADMIN";

  return <AiStudio agents={agents} providers={providers} builtIn={builtInModel()} canManage={canManage} initialAgentId={agent} />;
}
