import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AutomationBuilder } from "@/components/automations/builder/builder";
import { getAutomation, listChannelOptions } from "@/lib/services/automations";
import { listAgentOptions } from "@/lib/services/ai";
import { listPipelines } from "@/lib/services/pipelines";
import { requireWorkspaceContext } from "@/lib/workspace/context";

type Params = Promise<{ id: string }>;

// generateMetadata and the page both need the automation; cache dedupes the query per request.
const loadAutomation = cache((workspaceId: string, id: string) => getAutomation(workspaceId, id));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const automation = await loadAutomation(ctx.workspace.id, id);
  return { title: automation?.name ?? "Automation" };
}

export default async function AutomationBuilderPage({ params }: { params: Params }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const [automation, channels, pipelines, agents] = await Promise.all([
    loadAutomation(ctx.workspace.id, id),
    listChannelOptions(ctx.workspace.id),
    listPipelines(ctx.workspace.id),
    listAgentOptions(ctx.workspace.id),
  ]);
  if (!automation) notFound();

  // The builder owns the whole viewport; the page's <h1> is the editable name inside it.
  return (
    <>
      <h1 className="sr-only">{automation.name}</h1>
      <AutomationBuilder
        key={automation.id}
        automation={automation}
        channels={channels}
        pipelines={pipelines}
        agents={agents}
        canManageAi={ctx.role === "OWNER" || ctx.role === "ADMIN"}
      />
    </>
  );
}
